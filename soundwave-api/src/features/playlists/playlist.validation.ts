import { z } from "zod";

export const playlistIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");

export const playlistListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const playlistFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  artworkUrl: z.string().trim().url().max(2048),
  visibility: z.enum(["public", "private"]),
};

export const createPlaylistSchema = z
  .object({
    name: playlistFields.name,
    description: playlistFields.description.optional(),
    artworkUrl: playlistFields.artworkUrl.optional(),
    visibility: playlistFields.visibility.default("public"),
  })
  .strict();

export const updatePlaylistSchema = z
  .object({
    name: playlistFields.name.optional(),
    description: playlistFields.description.nullable().optional(),
    artworkUrl: playlistFields.artworkUrl.nullable().optional(),
    visibility: playlistFields.visibility.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one playlist field must be provided",
  });

export const addPlaylistTrackSchema = z
  .object({
    trackId: playlistIdSchema,
    position: z.number().int().min(0).optional(),
  })
  .strict();

export const reorderPlaylistTracksSchema = z
  .object({
    trackIds: z.array(playlistIdSchema).max(500),
  })
  .strict()
  .refine((value) => new Set(value.trackIds).size === value.trackIds.length, {
    message: "Track IDs must be unique",
    path: ["trackIds"],
  });
