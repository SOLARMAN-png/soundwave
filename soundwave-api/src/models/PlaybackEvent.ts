import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface PlaybackEvent {
  userId: Types.ObjectId;
  trackId: Types.ObjectId;
  playedAt: Date;
  secondsPlayed: number;
  completionPercent: number;
  contextType?: "playlist" | "album" | "artist" | "search" | "ai";
  contextId?: Types.ObjectId;
}

const playbackEventSchema = new mongoose.Schema<PlaybackEvent>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: "Track", required: true },
    playedAt: { type: Date, default: Date.now, required: true },
    secondsPlayed: { type: Number, default: 0, min: 0, required: true },
    completionPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      required: true,
    },
    contextType: {
      type: String,
      enum: ["playlist", "album", "artist", "search", "ai"],
    },
    contextId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, versionKey: false },
);

playbackEventSchema.index({ userId: 1, playedAt: -1 });
playbackEventSchema.index({ trackId: 1, playedAt: -1 });

export const PlaybackEventModel =
  (mongoose.models.PlaybackEvent as Model<PlaybackEvent> | undefined) ??
  mongoose.model<PlaybackEvent>("PlaybackEvent", playbackEventSchema);
