import mongoose from "mongoose";
import type { Request, RequestHandler, Response } from "express";
import { ArtistModel, FollowModel, LikeModel, TrackModel } from "../../models/index.js";
import { libraryIdSchema, libraryListQuerySchema } from "./library.validation.js";

function parseId(input: unknown, response: Response, label: string) {
  const result = libraryIdSchema.safeParse(input);
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

function parseListQuery(input: unknown, response: Response) {
  const result = libraryListQuerySchema.safeParse(input);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid query parameters",
      details: result.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return null;
  }
  return result.data;
}

function duplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export const likeTrack: RequestHandler = async (request, response) => {
  const trackId = parseId(request.params.trackId, response, "track");
  if (!trackId) return;

  const trackObjectId = new mongoose.Types.ObjectId(trackId);
  const exists = await TrackModel.exists({ _id: trackObjectId });
  if (!exists) {
    response.status(404).json({ error: "Track not found" });
    return;
  }

  const userId = currentUserId(request);
  const filter = {
    userId,
    trackId: trackObjectId,
  };
  try {
    await LikeModel.updateOne(filter, { $setOnInsert: filter }, { upsert: true }).exec();
  } catch (error: unknown) {
    if (!duplicateKeyError(error) || !(await LikeModel.exists(filter))) throw error;
  }
  response.status(204).end();
};

export const unlikeTrack: RequestHandler = async (request, response) => {
  const trackId = parseId(request.params.trackId, response, "track");
  if (!trackId) return;

  await LikeModel.deleteOne({
    userId: currentUserId(request),
    trackId: new mongoose.Types.ObjectId(trackId),
  }).exec();
  response.status(204).end();
};

export const listLikedTracks: RequestHandler = async (request, response) => {
  const pagination = parseListQuery(request.query, response);
  if (!pagination) return;

  const userId = currentUserId(request);
  const filter = { userId };
  const [likes, total] = await Promise.all([
    LikeModel.find(filter)
      .select("trackId createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .populate({
        path: "trackId",
        select: "title artistIds albumId durationSeconds explicit audioUrl artworkUrl previewUrl",
        populate: [
          { path: "artistIds", select: "name imageUrl" },
          { path: "albumId", select: "title artworkUrl releaseDate" },
        ],
      })
      .lean()
      .exec(),
    LikeModel.countDocuments(filter).exec(),
  ]);

  response.status(200).json({
    data: likes
      .filter((like) => like.trackId !== null)
      .map((like) => ({ track: like.trackId, likedAt: like.createdAt })),
    pagination: {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  });
};

export const followArtist: RequestHandler = async (request, response) => {
  const artistId = parseId(request.params.artistId, response, "artist");
  if (!artistId) return;

  const artistObjectId = new mongoose.Types.ObjectId(artistId);
  const exists = await ArtistModel.exists({ _id: artistObjectId });
  if (!exists) {
    response.status(404).json({ error: "Artist not found" });
    return;
  }

  const userId = currentUserId(request);
  const filter = {
    userId,
    artistId: artistObjectId,
  };
  try {
    await FollowModel.updateOne(filter, { $setOnInsert: filter }, { upsert: true }).exec();
  } catch (error: unknown) {
    if (!duplicateKeyError(error) || !(await FollowModel.exists(filter))) throw error;
  }
  response.status(204).end();
};

export const unfollowArtist: RequestHandler = async (request, response) => {
  const artistId = parseId(request.params.artistId, response, "artist");
  if (!artistId) return;

  await FollowModel.deleteOne({
    userId: currentUserId(request),
    artistId: new mongoose.Types.ObjectId(artistId),
  }).exec();
  response.status(204).end();
};

export const listFollowedArtists: RequestHandler = async (request, response) => {
  const pagination = parseListQuery(request.query, response);
  if (!pagination) return;

  const userId = currentUserId(request);
  const filter = { userId };
  const [follows, total] = await Promise.all([
    FollowModel.find(filter)
      .select("artistId createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .populate({ path: "artistId", select: "name bio imageUrl" })
      .lean()
      .exec(),
    FollowModel.countDocuments(filter).exec(),
  ]);

  response.status(200).json({
    data: follows
      .filter((follow) => follow.artistId !== null)
      .map((follow) => ({ artist: follow.artistId, followedAt: follow.createdAt })),
    pagination: {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  });
};
