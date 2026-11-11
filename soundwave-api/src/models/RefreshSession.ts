import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface RefreshSession {
  userId: Types.ObjectId;
  familyId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  purgeAt: Date;
  rotatedAt?: Date;
  revokedAt?: Date;
  familyRevokedAt?: Date;
  replacedBy?: Types.ObjectId;
}

const refreshSessionSchema = new mongoose.Schema<RefreshSession>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
    rotatedAt: { type: Date },
    revokedAt: { type: Date },
    familyRevokedAt: { type: Date },
    replacedBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, versionKey: false, collection: "refreshsessions" },
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true });
refreshSessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ familyId: 1, revokedAt: 1, rotatedAt: 1 });
refreshSessionSchema.index({ userId: 1, expiresAt: 1 });

export const RefreshSessionModel =
  (mongoose.models.RefreshSession as Model<RefreshSession> | undefined) ??
  mongoose.model<RefreshSession>("RefreshSession", refreshSessionSchema);