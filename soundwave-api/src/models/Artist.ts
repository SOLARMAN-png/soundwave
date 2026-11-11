import mongoose from "mongoose";
import type { Model, Types } from "mongoose";
import type { ProviderReference } from "./providerReference.js";

export interface Artist {
  name: string;
  bio?: string;
  imageUrl?: string;
  providerReferences: ProviderReference[];
}

const providerReferenceSchema = new mongoose.Schema<ProviderReference>(
  {
    provider: { type: String, required: true, trim: true, lowercase: true },
    providerId: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const artistSchema = new mongoose.Schema<Artist>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    bio: { type: String, trim: true, maxlength: 5000 },
    imageUrl: { type: String, trim: true },
    providerReferences: { type: [providerReferenceSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

artistSchema.index({ name: "text" });
artistSchema.index(
  { "providerReferences.provider": 1, "providerReferences.providerId": 1 },
  { name: "artist_provider_lookup" },
);

export const ArtistModel =
  (mongoose.models.Artist as Model<Artist> | undefined) ??
  mongoose.model<Artist>("Artist", artistSchema);
