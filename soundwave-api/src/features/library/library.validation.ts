import { z } from "zod";

export const libraryIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");

export const libraryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
