import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 UTF-8 bytes",
  });

export const registerSchema = z
  .object({
    email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(80),
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
      .transform((username) => username.toLowerCase())
      .optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
    password: z.string().min(1).refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Invalid email or password",
    }),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string().regex(/^[a-f\d]{64}$/i, "Invalid verification token"),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  })
  .strict();

export const onboardingPreferencesSchema = z
  .object({
    genres: z
      .array(z.string().trim().min(1).max(80).transform((genre) => genre.toLowerCase()))
      .max(5)
      .refine((genres) => new Set(genres).size === genres.length, {
        message: "Genres must be unique",
      }),
    artistIds: z
      .array(z.string().regex(/^[a-f\d]{24}$/i, "Invalid artist ID").transform((id) => id.toLowerCase()))
      .max(10)
      .refine((artistIds) => new Set(artistIds).size === artistIds.length, {
        message: "Artist IDs must be unique",
      }),
  })
  .strict()
  .refine((preferences) => preferences.genres.length + preferences.artistIds.length > 0, {
    message: "Choose at least one genre or artist",
  });
