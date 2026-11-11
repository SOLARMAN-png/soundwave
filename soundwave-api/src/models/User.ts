import mongoose from "mongoose";
import type { Model, Types } from "mongoose";

export interface UserPreferences {
  genres: string[];
  artistIds: Types.ObjectId[];
  updatedAt: Date;
}

export interface User {
  email: string;
  passwordHash?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: Date;
  preferences?: UserPreferences;
  status: "active" | "disabled";
}

const userPreferencesSchema = new mongoose.Schema<UserPreferences>(
  {
    genres: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 80 }],
      required: true,
      validate: {
        validator: (genres: string[]) => genres.length <= 5,
        message: "A user can select at most five genres",
      },
    },
    artistIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Artist" }],
      required: true,
      validate: {
        validator: (artistIds: Types.ObjectId[]) => artistIds.length <= 10,
        message: "A user can select at most ten artists",
      },
    },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema<User>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, select: false },
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_]+$/,
    },
    avatarUrl: { type: String, trim: true },
    emailVerified: { type: Boolean },
    emailVerifiedAt: { type: Date },
    onboardingCompleted: { type: Boolean },
    onboardingCompletedAt: { type: Date },
    preferences: { type: userPreferencesSchema },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
  { username: 1 },
  { unique: true, sparse: true, name: "unique_username_when_present" },
);

export const UserModel =
  (mongoose.models.User as Model<User> | undefined) ??
  mongoose.model<User>("User", userSchema);
