import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface Playlist {
  ownerId: Types.ObjectId;
  name: string;
  description?: string;
  artworkUrl?: string;
  visibility: "public" | "private";
  source: "user" | "ai";
  createdAt: Date;
  updatedAt: Date;
  generation?: {
    prompt: string;
    mood?: string;
    generatedAt: Date;
  };
}

const generationSchema = new mongoose.Schema<NonNullable<Playlist["generation"]>>(
  {
    prompt: { type: String, required: true, trim: true, maxlength: 1000 },
    mood: { type: String, trim: true, maxlength: 100 },
    generatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const playlistSchema = new mongoose.Schema<Playlist>(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    artworkUrl: { type: String, trim: true },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      required: true,
    },
    source: {
      type: String,
      enum: ["user", "ai"],
      default: "user",
      required: true,
    },
    generation: { type: generationSchema },
  },
  { timestamps: true, versionKey: false },
);

playlistSchema.index({ ownerId: 1, updatedAt: -1 });
playlistSchema.index({ visibility: 1, updatedAt: -1 });

export const PlaylistModel =
  (mongoose.models.Playlist as Model<Playlist> | undefined) ??
  mongoose.model<Playlist>("Playlist", playlistSchema);
