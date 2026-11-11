import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");

export const playbackEventSchema = z
  .object({
    trackId: objectIdSchema,
    secondsPlayed: z.number().finite().min(0).max(86_400).default(0),
    completionPercent: z.number().finite().min(0).max(100).default(0),
    contextType: z.enum(["playlist", "album", "artist", "search", "ai"]).optional(),
    contextId: objectIdSchema.optional(),
  })
  .strict()
  .refine(
    (event) =>
      (event.contextType === undefined) === (event.contextId === undefined),
    {
      message: "contextType and contextId must be provided together",
      path: ["contextId"],
    },
  );

export const playbackHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const playbackHistoryIdSchema = objectIdSchema;
