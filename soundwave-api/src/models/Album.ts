import mongoose from "mongoose";
import type { Model, Types } from "mongoose";
import type { ProviderReference } from "./providerReference.js";

export interface Album {
  title: string;
  artistIds: Types.ObjectId[];
  releaseDate?: Date;
  artworkUrl?: string;
  artworkPublicId?: string;
  providerReferences: ProviderReference[];
}

const providerReferenceSchema = new mongoose.Schema<ProviderReference>(
  {
    provider: { type: String, required: true, trim: true, lowercase: true },
    providerId: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const albumSchema = new mongoose.Schema<Album>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    artistIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Artist" }],
      required: true,
      validate: {
        validator: (artistIds: Types.ObjectId[]) => artistIds.length > 0,
        message: "An album must have at least one artist",
      },
    },
    releaseDate: { type: Date },
    artworkUrl: { type: String, trim: true },
    artworkPublicId: { type: String, trim: true },
    providerReferences: { type: [providerReferenceSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

albumSchema.index({ title: "text" });
albumSchema.index({ artistIds: 1 });
albumSchema.index(
  { "providerReferences.provider": 1, "providerReferences.providerId": 1 },
  { name: "album_provider_lookup" },
);

export const AlbumModel =
  (mongoose.models.Album as Model<Album> | undefined) ??
  mongoose.model<Album>("Album", albumSchema);
