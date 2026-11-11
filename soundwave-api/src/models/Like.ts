import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface Like {
  userId: Types.ObjectId;
  trackId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const likeSchema = new mongoose.Schema<Like>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: "Track", required: true },
  },
  { timestamps: true, versionKey: false },
);

likeSchema.index({ userId: 1, trackId: 1 }, { unique: true });
likeSchema.index({ userId: 1, createdAt: -1 });

export const LikeModel =
  (mongoose.models.Like as Model<Like> | undefined) ??
  mongoose.model<Like>("Like", likeSchema);
