import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface EmailVerificationToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

const emailVerificationTokenSchema = new mongoose.Schema<EmailVerificationToken>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailVerificationTokenSchema.index({ userId: 1 });

export const EmailVerificationTokenModel =
  (mongoose.models.EmailVerificationToken as Model<EmailVerificationToken> | undefined) ??
  mongoose.model<EmailVerificationToken>("EmailVerificationToken", emailVerificationTokenSchema);