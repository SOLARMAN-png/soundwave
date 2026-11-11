import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface Follow {
  userId: Types.ObjectId;
  artistId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const followSchema = new mongoose.Schema<Follow>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    artistId: { type: mongoose.Schema.Types.ObjectId, ref: "Artist", required: true },
  },
  { timestamps: true, versionKey: false },
);

followSchema.index({ userId: 1, artistId: 1 }, { unique: true });
followSchema.index({ artistId: 1, createdAt: -1 });

export const FollowModel =
  (mongoose.models.Follow as Model<Follow> | undefined) ??
  mongoose.model<Follow>("Follow", followSchema);
