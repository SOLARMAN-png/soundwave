import mongoose from "mongoose";
import type { Request, RequestHandler } from "express";
import { PlaybackEventModel, TrackModel } from "../../models/index.js";
import {
  playbackEventSchema,
  playbackHistoryIdSchema,
  playbackHistoryQuerySchema,
} from "./playback.validation.js";

function currentUserId(request: Request) {
  const id: unknown = request.authenticatedUser?.id;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Authenticated user is missing a valid ID");
  }
  return new mongoose.Types.ObjectId(id);
}

export const recordPlayback: RequestHandler = async (request, response) => {
  const parsed = playbackEventSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid playback event",
      details: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  const trackId = new mongoose.Types.ObjectId(parsed.data.trackId);
  const trackExists = await TrackModel.exists({ _id: trackId });
  if (!trackExists) {
    response.status(404).json({ error: "Track not found" });
    return;
  }

  const event = new PlaybackEventModel({
    trackId,
    userId: currentUserId(request),
    playedAt: new Date(),
    secondsPlayed: parsed.data.secondsPlayed,
    completionPercent: parsed.data.completionPercent,
    ...(parsed.data.contextType ? { contextType: parsed.data.contextType } : {}),
    ...(parsed.data.contextId
      ? { contextId: new mongoose.Types.ObjectId(parsed.data.contextId) }
      : {}),
  });
  await event.save();

  await event.populate({
    path: "trackId",
    select: "title artistIds albumId durationSeconds explicit audioUrl artworkUrl previewUrl",
    populate: [
      { path: "artistIds", select: "name imageUrl" },
      { path: "albumId", select: "title artworkUrl releaseDate" },
    ],
  });

  response.status(201).json({
    data: {
      id: event._id.toString(),
      track: event.trackId,
      playedAt: event.playedAt,
      secondsPlayed: event.secondsPlayed,
      completionPercent: event.completionPercent,
      ...(event.contextType ? { contextType: event.contextType } : {}),
      ...(event.contextId ? { contextId: event.contextId.toString() } : {}),
    },
  });
};

export const listPlaybackHistory: RequestHandler = async (request, response) => {
  const parsed = playbackHistoryQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  const userId = currentUserId(request);
  const filter = { userId };
  const { page, limit } = parsed.data;
  const [events, total] = await Promise.all([
    PlaybackEventModel.find(filter)
      .select("trackId playedAt secondsPlayed completionPercent contextType contextId")
      .sort({ playedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
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
    PlaybackEventModel.countDocuments(filter).exec(),
  ]);

  response.status(200).json({
    data: events
      .filter((event) => event.trackId !== null)
      .map((event) => ({
        id: event._id.toString(),
        track: event.trackId,
        playedAt: event.playedAt,
        secondsPlayed: event.secondsPlayed,
        completionPercent: event.completionPercent,
        ...(event.contextType ? { contextType: event.contextType } : {}),
        ...(event.contextId ? { contextId: event.contextId.toString() } : {}),
      })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

export const deletePlaybackHistoryEntry: RequestHandler = async (request, response) => {
  const parsedId = playbackHistoryIdSchema.safeParse(request.params.id);
  if (!parsedId.success) {
    response.status(400).json({ error: "Invalid history entry ID" });
    return;
  }

  const result = await PlaybackEventModel.deleteOne({
    _id: parsedId.data,
    userId: currentUserId(request),
  }).exec();
  if (result.deletedCount === 0) {
    response.status(404).json({ error: "History entry not found" });
    return;
  }

  response.status(204).end();
};
