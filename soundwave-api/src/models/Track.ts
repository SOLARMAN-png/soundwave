import mongoose from "mongoose";
import type { Model, Types } from "mongoose";
import type { ProviderReference } from "./providerReference.js";

export interface Track {
  title: string;
  artistIds: Types.ObjectId[];
  albumId?: Types.ObjectId;
  trackNumber?: number;
  durationSeconds: number;
  explicit: boolean;
  genre: string;
  audioUrl?: string;
  audioPublicId?: string;
  artworkUrl?: string;
  artworkPublicId?: string;
  previewUrl?: string;
  published: boolean;
  providerReferences: ProviderReference[];
}

const providerReferenceSchema = new mongoose.Schema<ProviderReference>(
  {
    provider: { type: String, required: true, trim: true, lowercase: true },
    providerId: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const trackSchema = new mongoose.Schema<Track>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    artistIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Artist" }],
      required: true,
      validate: {
        validator: (artistIds: Types.ObjectId[]) => artistIds.length > 0,
        message: "A track must have at least one artist",
      },
    },
    albumId: { type: mongoose.Schema.Types.ObjectId, ref: "Album" },
    trackNumber: { type: Number, min: 1 },
    durationSeconds: { type: Number, required: true, min: 0 },
    explicit: { type: Boolean, default: false, required: true },
    genre: { type: String, required: true, trim: true, maxlength: 80 },
    audioUrl: { type: String, trim: true },
    audioPublicId: { type: String, trim: true },
    artworkUrl: { type: String, trim: true },
    artworkPublicId: { type: String, trim: true },
    previewUrl: { type: String, trim: true },
    published: { type: Boolean, default: true, required: true },
    providerReferences: { type: [providerReferenceSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

trackSchema.index({ title: "text" });
trackSchema.index({ artistIds: 1, title: 1 });
trackSchema.index({ albumId: 1 });
trackSchema.index(
  { "providerReferences.provider": 1, "providerReferences.providerId": 1 },
  { name: "track_provider_lookup" },
);

export const TrackModel =
  (mongoose.models.Track as Model<Track> | undefined) ??
  mongoose.model<Track>("Track", trackSchema);
