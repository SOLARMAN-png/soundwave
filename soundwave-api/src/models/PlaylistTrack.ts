import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface PlaylistTrack {
  playlistId: Types.ObjectId;
  trackId: Types.ObjectId;
  position: number;
  addedBy: Types.ObjectId;
  addedAt: Date;
}

const playlistTrackSchema = new mongoose.Schema<PlaylistTrack>(
  {
    playlistId: { type: mongoose.Schema.Types.ObjectId, ref: "Playlist", required: true },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: "Track", required: true },
    position: { type: Number, required: true, min: 0 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedAt: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);

playlistTrackSchema.index({ playlistId: 1, position: 1 }, { unique: true });
playlistTrackSchema.index({ trackId: 1 });

export const PlaylistTrackModel =
  (mongoose.models.PlaylistTrack as Model<PlaylistTrack> | undefined) ??
  mongoose.model<PlaylistTrack>("PlaylistTrack", playlistTrackSchema);
