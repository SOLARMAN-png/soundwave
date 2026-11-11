import mongoose from "mongoose";
import type { Request, RequestHandler, Response } from "express";
import { PlaylistModel, PlaylistTrackModel, TrackModel } from "../../models/index.js";
import {
  addPlaylistTrackSchema,
  createPlaylistSchema,
  playlistIdSchema,
  playlistListQuerySchema,
  reorderPlaylistTracksSchema,
  updatePlaylistSchema,
} from "./playlist.validation.js";

function validationError(response: Response, issues: { path: PropertyKey[]; message: string }[]) {
  response.status(400).json({
    error: "Invalid request",
    details: issues.map(({ path, message }) => ({ path, message })),
  });
}

function parseId(input: unknown, response: Response, label: string) {
  const result = playlistIdSchema.safeParse(input);
  if (!result.success) {
    response.status(400).json({ error: `Invalid ${label} ID` });
    return null;
  }

  return result.data;
}

function currentUserId(request: Request) {
  const id: unknown = request.authenticatedUser?.id;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Authenticated user is missing a valid ID");
  }
  return new mongoose.Types.ObjectId(id);
}

async function findOwnedPlaylist(id: string, ownerId: mongoose.Types.ObjectId) {
  return PlaylistModel.findOne({ _id: id, ownerId }).exec();
}

async function getPlaylistResponse(playlistId: mongoose.Types.ObjectId) {
  const playlist = await PlaylistModel.findById(playlistId)
    .select("ownerId name description artworkUrl visibility source generation createdAt updatedAt")
    .populate({ path: "ownerId", select: "displayName username avatarUrl" })
    .lean()
    .exec();

  if (!playlist) return null;

  const tracks = await PlaylistTrackModel.find({ playlistId })
    .sort({ position: 1 })
    .select("position addedAt")
    .populate({
      path: "trackId",
      select: "title artistIds albumId durationSeconds explicit artworkUrl previewUrl",
      populate: [
        { path: "artistIds", select: "name imageUrl" },
        { path: "albumId", select: "title artworkUrl releaseDate" },
      ],
    })
    .lean()
    .exec();

  return { ...playlist, tracks };
}

export const createPlaylist: RequestHandler = async (request, response) => {
  const parsed = createPlaylistSchema.safeParse(request.body);
  if (!parsed.success) {
    validationError(response, parsed.error.issues);
    return;
  }

  const playlist = await PlaylistModel.create({
    name: parsed.data.name,
    visibility: parsed.data.visibility,
    ...(parsed.data.description !== undefined
      ? { description: parsed.data.description }
      : {}),
    ...(parsed.data.artworkUrl !== undefined ? { artworkUrl: parsed.data.artworkUrl } : {}),
    ownerId: currentUserId(request),
    source: "user",
  });

  response.status(201).json({
    data: {
      id: playlist._id.toString(),
      name: playlist.name,
      description: playlist.description,
      artworkUrl: playlist.artworkUrl,
      visibility: playlist.visibility,
      source: playlist.source,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      tracks: [],
    },
  });
};

export const listPlaylists: RequestHandler = async (request, response) => {
  const parsed = playlistListQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    validationError(response, parsed.error.issues);
    return;
  }

  const ownerId = currentUserId(request);
  const { page, limit } = parsed.data;
  const filter = { ownerId };
  const [playlists, total] = await Promise.all([
    PlaylistModel.find(filter)
      .select("name description artworkUrl visibility source createdAt updatedAt")
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec(),
    PlaylistModel.countDocuments(filter).exec(),
  ]);
  const playlistIds = playlists.map((playlist) => playlist._id);
  const counts = await PlaylistTrackModel.aggregate([
    { $match: { playlistId: { $in: playlistIds } } },
    { $group: { _id: "$playlistId", trackCount: { $sum: 1 } } },
  ]).exec();
  const countsByPlaylistId = new Map(
    counts.map((item) => [item._id.toString(), item.trackCount as number]),
  );

  response.status(200).json({
    data: playlists.map((playlist) => ({
      ...playlist,
      trackCount: countsByPlaylistId.get(playlist._id.toString()) ?? 0,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

export const getPlaylist: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response, "playlist");
  if (!id) return;

  const playlist = await PlaylistModel.findById(id)
    .select("ownerId visibility")
    .lean()
    .exec();
  if (!playlist) {
    response.status(404).json({ error: "Playlist not found" });
    return;
  }

  if (
    playlist.visibility === "private" &&
    !playlist.ownerId.equals(currentUserId(request))
  ) {
    response.status(404).json({ error: "Playlist not found" });
    return;
  }

  const data = await getPlaylistResponse(playlist._id);
  response.status(200).json({ data });
};

export const updatePlaylist: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response, "playlist");
  if (!id) return;

  const parsed = updatePlaylistSchema.safeParse(request.body);
  if (!parsed.success) {
    validationError(response, parsed.error.issues);
    return;
  }

  const playlist = await PlaylistModel.findOneAndUpdate(
    { _id: id, ownerId: currentUserId(request) },
    { $set: parsed.data },
    { new: true, runValidators: true, projection: "name description artworkUrl visibility source createdAt updatedAt" },
  )
    .lean()
    .exec();

  if (!playlist) {
    response.status(404).json({ error: "Playlist not found" });
    return;
  }

  response.status(200).json({ data: playlist });
};

export const addTrackToPlaylist: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response, "playlist");
  if (!id) return;

  const parsed = addPlaylistTrackSchema.safeParse(request.body);
  if (!parsed.success) {
    validationError(response, parsed.error.issues);
    return;
  }

  const ownerId = currentUserId(request);
  const playlistId = new mongoose.Types.ObjectId(id);
  const session = await mongoose.startSession();
  let result:
    | { status: 201; data: { playlistId: string; trackId: string; position: number } }
    | { status: 404; error: string }
    | { status: 400 | 409; error: string }
    | { status: 422; error: string }
    | undefined;

  try {
    await session.withTransaction(async () => {
      const playlist = await PlaylistModel.findOne({ _id: playlistId, ownerId })
        .session(session)
        .exec();
      if (!playlist) {
        result = { status: 404, error: "Playlist not found" };
        return;
      }

      const trackId = new mongoose.Types.ObjectId(parsed.data.trackId);
      const trackExists = await TrackModel.exists({ _id: trackId }).session(session);
      if (!trackExists) {
        result = { status: 422, error: "Track not found" };
        return;
      }

      const existing = await PlaylistTrackModel.findOne({ playlistId, trackId })
        .session(session)
        .exec();
      if (existing) {
        result = { status: 409, error: "Track is already in this playlist" };
        return;
      }

      const entries = await PlaylistTrackModel.find({ playlistId })
        .sort({ position: 1 })
        .session(session)
        .exec();
      const position = parsed.data.position ?? entries.length;
      if (position > entries.length) {
        result = {
          status: 400,
          error: "Position must be between 0 and the playlist track count",
        };
        return;
      }

      for (let index = entries.length - 1; index >= position; index -= 1) {
        const entry = entries[index];
        if (!entry) continue;
        entry.position += 1;
        await entry.save({ session });
      }

      await PlaylistTrackModel.create(
        [{ playlistId, trackId, position, addedBy: ownerId }],
        { session },
      );
      await PlaylistModel.updateOne({ _id: playlistId }, { $set: { updatedAt: new Date() } })
        .session(session)
        .exec();

      result = {
        status: 201,
        data: { playlistId: id, trackId: parsed.data.trackId, position },
      };
    });
  } finally {
    await session.endSession();
  }

  if (!result) throw new Error("Playlist track operation completed without a result");
  if ("error" in result) {
    response.status(result.status).json({ error: result.error });
    return;
  }
  response.status(result.status).json({ data: result.data });
};

export const removeTrackFromPlaylist: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response, "playlist");
  if (!id) return;
  const trackId = parseId(request.params.trackId, response, "track");
  if (!trackId) return;

  const ownerId = currentUserId(request);
  const playlistId = new mongoose.Types.ObjectId(id);
  const trackObjectId = new mongoose.Types.ObjectId(trackId);
  const session = await mongoose.startSession();
  let result: { status: 204 } | { status: 404; error: string } | undefined;

  try {
    await session.withTransaction(async () => {
      const playlist = await PlaylistModel.findOne({ _id: playlistId, ownerId })
        .session(session)
        .exec();
      if (!playlist) {
        result = { status: 404, error: "Playlist not found" };
        return;
      }

      const entry = await PlaylistTrackModel.findOne({ playlistId, trackId: trackObjectId })
        .session(session)
        .exec();
      if (!entry) {
        result = { status: 404, error: "Track not found in playlist" };
        return;
      }

      const removedPosition = entry.position;
      await entry.deleteOne({ session });
      const followingEntries = await PlaylistTrackModel.find({
        playlistId,
        position: { $gt: removedPosition },
      })
        .sort({ position: 1 })
        .session(session)
        .exec();

      for (const followingEntry of followingEntries) {
        followingEntry.position -= 1;
        await followingEntry.save({ session });
      }

      await PlaylistModel.updateOne({ _id: playlistId }, { $set: { updatedAt: new Date() } })
        .session(session)
        .exec();
      result = { status: 204 };
    });
  } finally {
    await session.endSession();
  }

  if (!result) throw new Error("Playlist track removal completed without a result");
  if ("error" in result) {
    response.status(result.status).json({ error: result.error });
    return;
  }
  response.status(204).end();
};

export const reorderPlaylistTracks: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response, "playlist");
  if (!id) return;

  const parsed = reorderPlaylistTracksSchema.safeParse(request.body);
  if (!parsed.success) {
    validationError(response, parsed.error.issues);
    return;
  }

  const ownerId = currentUserId(request);
  const playlistId = new mongoose.Types.ObjectId(id);
  const session = await mongoose.startSession();
  let result:
    | { status: 200; data: { playlistId: string; trackIds: string[] } }
    | { status: 404; error: string }
    | { status: 400; error: string }
    | undefined;

  try {
    await session.withTransaction(async () => {
      const playlist = await PlaylistModel.findOne({ _id: playlistId, ownerId })
        .session(session)
        .exec();
      if (!playlist) {
        result = { status: 404, error: "Playlist not found" };
        return;
      }

      const entries = await PlaylistTrackModel.find({ playlistId })
        .session(session)
        .exec();
      const currentIds = new Set(entries.map((entry) => entry.trackId.toString()));
      if (
        entries.length !== parsed.data.trackIds.length ||
        parsed.data.trackIds.some((trackId) => !currentIds.has(trackId))
      ) {
        result = {
          status: 400,
          error: "trackIds must contain every playlist track exactly once",
        };
        return;
      }

      const entriesByTrackId = new Map(
        entries.map((entry) => [entry.trackId.toString(), entry]),
      );
      for (const [index, trackId] of parsed.data.trackIds.entries()) {
        const entry = entriesByTrackId.get(trackId);
        if (!entry) continue;
        await PlaylistTrackModel.updateOne(
          { _id: entry._id },
          { $set: { position: -(index + 1) } },
          { session },
        ).exec();
      }
      for (const [position, trackId] of parsed.data.trackIds.entries()) {
        const entry = entriesByTrackId.get(trackId);
        if (!entry) continue;
        await PlaylistTrackModel.updateOne(
          { _id: entry._id },
          { $set: { position } },
          { session, runValidators: true },
        ).exec();
      }

      await PlaylistModel.updateOne({ _id: playlistId }, { $set: { updatedAt: new Date() } })
        .session(session)
        .exec();
      result = {
        status: 200,
        data: { playlistId: id, trackIds: parsed.data.trackIds },
      };
    });
  } finally {
    await session.endSession();
  }

  if (!result) throw new Error("Playlist track reorder completed without a result");
  if ("error" in result) {
    response.status(result.status).json({ error: result.error });
    return;
  }
  response.status(result.status).json({ data: result.data });
};
