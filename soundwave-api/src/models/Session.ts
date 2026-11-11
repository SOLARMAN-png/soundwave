import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface Session {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}

const sessionSchema = new mongoose.Schema<Session>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, expiresAt: 1 });

export const SessionModel =
  (mongoose.models.Session as Model<Session> | undefined) ??
  mongoose.model<Session>("Session", sessionSchema);
