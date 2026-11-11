import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { jwtVerify, SignJWT } from "jose";
import { getAuthConfiguration } from "../../config/auth.js";
import {
  ArtistModel,
  EmailVerificationTokenModel,
  RefreshSessionModel,
  TrackModel,
  UserModel,
} from "../../models/index.js";
import type { z } from "zod";
import type { onboardingPreferencesSchema } from "./auth.validation.js";

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_REUSE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);

export class InvalidOnboardingSelectionError extends Error {}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  onboardingCompleted: boolean;
}

function toPublicUser(user: {
  _id: Types.ObjectId;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  onboardingCompleted?: boolean;
}): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    ...(user.username ? { username: user.username } : {}),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    onboardingCompleted: user.onboardingCompleted !== false,
  };
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getRefreshTokenPurgeDate(expiresAt: Date) {
  return new Date(expiresAt.getTime() + REFRESH_TOKEN_REUSE_RETENTION_MS);
}

async function revokeRefreshFamily(familyId: Types.ObjectId, revokedAt = new Date()) {
  await RefreshSessionModel.updateOne(
    { _id: familyId, familyRevokedAt: { $exists: false } },
    { $set: { familyRevokedAt: revokedAt } },
  ).exec();
  await RefreshSessionModel.updateMany(
    { familyId, revokedAt: { $exists: false }, rotatedAt: { $exists: false } },
    { $set: { revokedAt } },
  ).exec();
}

async function createAccessToken(userId: string) {
  const configuration = getAuthConfiguration();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((issuedAt + configuration.accessTokenTtlSeconds) * 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(configuration.issuer)
    .setAudience(configuration.audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + configuration.accessTokenTtlSeconds)
    .sign(configuration.accessTokenSecret);

  return { token, expiresAt };
}

export async function createTokenPair(userId: Types.ObjectId) {
  const configuration = getAuthConfiguration();
  const refreshToken = randomBytes(32).toString("hex");
  const refreshExpiresAt = new Date(Date.now() + configuration.refreshTokenTtlSeconds * 1000);
  const access = await createAccessToken(userId.toString());
  const familyId = new Types.ObjectId();

  await RefreshSessionModel.create({
    _id: familyId,
    userId,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiresAt,
    purgeAt: getRefreshTokenPurgeDate(refreshExpiresAt),
  });

  return {
    accessToken: access.token,
    refreshToken,
    accessExpiresAt: access.expiresAt,
    refreshExpiresAt,
  };
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  username?: string | undefined;
}) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await UserModel.create({
    email: input.email,
    passwordHash,
    displayName: input.displayName,
    emailVerified: false,
    onboardingCompleted: false,
    ...(input.username ? { username: input.username } : {}),
  });

  return { user: toPublicUser(user), userId: user._id };
}

export async function registerUserForEmailVerification(input: {
  email: string;
  password: string;
  displayName: string;
  username?: string | undefined;
}) {
  const { user, userId } = await registerUser(input);

  try {
    const verificationToken = randomBytes(32).toString("hex");
    await EmailVerificationTokenModel.create({
      userId,
      tokenHash: hashRefreshToken(verificationToken),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });
    return { user, verificationToken };
  } catch (error: unknown) {
    await discardPendingRegistration(userId.toString());
    throw error;
  }
}

export async function createVerificationForPendingUser(email: string) {
  const user = await UserModel.findOne({ email, status: "active", emailVerified: false })
    .select("_id email displayName")
    .lean()
    .exec();
  if (!user) return null;

  const verificationToken = randomBytes(32).toString("hex");
  await EmailVerificationTokenModel.create({
    userId: user._id,
    tokenHash: hashRefreshToken(verificationToken),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  return { email: user.email, displayName: user.displayName, verificationToken };
}

export async function discardPendingRegistration(userId: string) {
  await EmailVerificationTokenModel.deleteMany({ userId }).exec();
  await UserModel.deleteOne({ _id: userId, emailVerified: false }).exec();
}

export async function verifyEmailAddress(token: string) {
  const now = new Date();
  const verification = await EmailVerificationTokenModel.findOneAndUpdate(
    {
      tokenHash: hashRefreshToken(token),
      expiresAt: { $gt: now },
      usedAt: { $exists: false },
    },
    { $set: { usedAt: now } },
    { returnDocument: "after" },
  )
    .lean()
    .exec();

  if (!verification) return null;

  const user = await UserModel.findOneAndUpdate(
    { _id: verification.userId, status: "active", emailVerified: false },
    { $set: { emailVerified: true, emailVerifiedAt: now } },
    { returnDocument: "after" },
  )
    .select("_id email displayName username avatarUrl onboardingCompleted")
    .lean()
    .exec();

  if (!user) return null;

  const tokens = await createTokenPair(user._id);
  return { user: toPublicUser(user), tokens };
}

export async function saveOnboardingPreferences(
  userId: string,
  preferences: z.infer<typeof onboardingPreferencesSchema>,
) {
  const genres = preferences.genres.map((genre) => genre.toLowerCase());
  const availableGenres = new Set(
    (await TrackModel.distinct("genre", { published: true }).exec())
      .map((genre) => genre.trim().toLowerCase())
      .filter(Boolean),
  );
  if (genres.some((genre) => !availableGenres.has(genre))) {
    throw new InvalidOnboardingSelectionError("One or more selected genres are unavailable");
  }

  const artistIds = preferences.artistIds.map((id) => new Types.ObjectId(id));
  const availableArtistCount = await ArtistModel.countDocuments({ _id: { $in: artistIds } });
  if (availableArtistCount !== artistIds.length) {
    throw new InvalidOnboardingSelectionError("One or more selected artists are unavailable");
  }

  const updatedAt = new Date();
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, status: "active" },
    {
      $set: {
        preferences: { genres, artistIds, updatedAt },
        onboardingCompleted: true,
        onboardingCompletedAt: updatedAt,
      },
    },
    { returnDocument: "after", runValidators: true },
  )
    .select("preferences onboardingCompleted onboardingCompletedAt")
    .lean()
    .exec();

  if (!user?.preferences) return null;

  return {
    onboardingCompleted: user.onboardingCompleted !== false,
    onboardingCompletedAt: user.onboardingCompletedAt,
    preferences: {
      genres: user.preferences.genres,
      artistIds: user.preferences.artistIds.map((id) => id.toString()),
      updatedAt: user.preferences.updatedAt,
    },
  };
}

export async function getOnboardingPreferences(userId: string) {
  const user = await UserModel.findOne({ _id: userId, status: "active" })
    .select("preferences onboardingCompleted onboardingCompletedAt")
    .lean()
    .exec();

  if (!user) return null;

  return {
    onboardingCompleted: user.onboardingCompleted !== false,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
    preferences: {
      genres: user.preferences?.genres ?? [],
      artistIds: user.preferences?.artistIds.map((id) => id.toString()) ?? [],
      updatedAt: user.preferences?.updatedAt ?? null,
    },
  };
}

export async function authenticateUser(email: string, password: string) {
  const user = await UserModel.findOne({ email })
    .select("+passwordHash email displayName username avatarUrl onboardingCompleted status emailVerified")
    .exec();

  const candidateHash = user?.passwordHash ?? (await DUMMY_PASSWORD_HASH);
  const passwordMatches = await bcrypt.compare(password, candidateHash);

  if (!user || user.status !== "active" || !passwordMatches) {
    return null;
  }
  if (user.emailVerified === false) return { emailVerificationRequired: true as const };

  return { user: toPublicUser(user), userId: user._id };
}

export async function findAuthenticatedUser(accessToken: string) {
  const configuration = getAuthConfiguration();
  let userId: string;

  try {
    const { payload } = await jwtVerify(accessToken, configuration.accessTokenSecret, {
      algorithms: ["HS256"],
      issuer: configuration.issuer,
      audience: configuration.audience,
    });
    if (typeof payload.sub !== "string" || !Types.ObjectId.isValid(payload.sub)) {
      return null;
    }
    userId = payload.sub;
  } catch {
    return null;
  }

  const user = await UserModel.findOne({ _id: userId, status: "active" })
    .select("_id email displayName username avatarUrl onboardingCompleted emailVerified")
    .lean()
    .exec();

  if (!user || user.emailVerified === false) return null;

  return { user: toPublicUser(user) };
}

export async function rotateRefreshToken(refreshToken: string) {
  const configuration = getAuthConfiguration();
  const oldTokenHash = hashRefreshToken(refreshToken);
  const now = new Date();
  const session = await RefreshSessionModel.findOne({ tokenHash: oldTokenHash })
    .select("userId familyId expiresAt rotatedAt revokedAt")
    .lean()
    .exec();

  if (!session) return null;

  const family = await RefreshSessionModel.findById(session.familyId)
    .select("familyRevokedAt")
    .lean()
    .exec();

  if (!family || family.familyRevokedAt || session.revokedAt) return null;

  if (session.rotatedAt) {
    await revokeRefreshFamily(session.familyId, now);
    return null;
  }

  if (session.expiresAt <= now) {
    await RefreshSessionModel.updateOne(
      { _id: session._id, rotatedAt: { $exists: false }, revokedAt: { $exists: false } },
      { $set: { revokedAt: now } },
    ).exec();
    return null;
  }

  const user = await UserModel.findOne({ _id: session.userId, status: "active" })
    .select("_id email displayName username avatarUrl onboardingCompleted emailVerified")
    .lean()
    .exec();

  if (!user || user.emailVerified === false) {
    await revokeRefreshFamily(session.familyId, now);
    return null;
  }

  const nextRefreshToken = randomBytes(32).toString("hex");
  const refreshExpiresAt = new Date(Date.now() + configuration.refreshTokenTtlSeconds * 1000);
  const access = await createAccessToken(user._id.toString());
  const nextTokenId = new Types.ObjectId();
  const rotatedSession = await RefreshSessionModel.findOneAndUpdate(
    {
      _id: session._id,
      tokenHash: oldTokenHash,
      expiresAt: { $gt: now },
      rotatedAt: { $exists: false },
      revokedAt: { $exists: false },
    },
    {
      $set: {
        rotatedAt: now,
        replacedBy: nextTokenId,
      },
    },
    { returnDocument: "after", projection: { _id: 1 } },
  )
    .lean()
    .exec();

  if (!rotatedSession) {
    const latestSession = await RefreshSessionModel.findById(session._id)
      .select("rotatedAt revokedAt")
      .lean()
      .exec();
    if (latestSession?.rotatedAt && !latestSession.revokedAt) {
      await revokeRefreshFamily(session.familyId, new Date());
    }
    return null;
  }

  try {
    await RefreshSessionModel.create({
      _id: nextTokenId,
      userId: session.userId,
      familyId: session.familyId,
      tokenHash: hashRefreshToken(nextRefreshToken),
      expiresAt: refreshExpiresAt,
      purgeAt: getRefreshTokenPurgeDate(refreshExpiresAt),
    });
  } catch (error: unknown) {
    await revokeRefreshFamily(session.familyId, new Date());
    throw error;
  }

  const familyUpdate = await RefreshSessionModel.updateOne(
    { _id: session.familyId, familyRevokedAt: { $exists: false } },
    { $set: { purgeAt: getRefreshTokenPurgeDate(refreshExpiresAt) } },
  ).exec();

  if (familyUpdate.matchedCount === 0) {
    await RefreshSessionModel.updateOne(
      { _id: nextTokenId },
      { $set: { revokedAt: new Date() } },
    ).exec();
    return null;
  }

  return {
    user: toPublicUser(user),
    accessToken: access.token,
    refreshToken: nextRefreshToken,
    accessExpiresAt: access.expiresAt,
    refreshExpiresAt,
  };
}

export async function revokeRefreshToken(token: string) {
  const session = await RefreshSessionModel.findOne({ tokenHash: hashRefreshToken(token) })
    .select("familyId")
    .lean()
    .exec();
  if (session) await revokeRefreshFamily(session.familyId);
}
