import { z } from "zod";

export const createTrackSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(160),
  album: z.string().trim().min(1).max(200),
  genre: z.string().trim().min(1).max(80),
  durationSeconds: z.coerce.number().int().min(1).max(86400),
  explicit: z.enum(["true", "false"]).transform((value) => value === "true"),
  audioUrl: z.string().url(),
  audioPublicId: z.string().trim().min(1).max(255),
  artworkUrl: z.string().url(),
  artworkPublicId: z.string().trim().min(1).max(255),
});

export const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(160),
  releaseDate: z.iso.date().optional(),
  artworkUrl: z.string().url(),
  artworkPublicId: z.string().trim().min(1).max(255),
  tracks: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    genre: z.string().trim().min(1).max(80),
    durationSeconds: z.coerce.number().int().min(1).max(86400),
    explicit: z.boolean(),
    audioUrl: z.string().url(),
    audioPublicId: z.string().trim().min(1).max(255),
  })).min(1).max(50),
});

export const uploadSignatureSchema = z.object({
  mediaType: z.enum(["audio", "artwork"]),
});
