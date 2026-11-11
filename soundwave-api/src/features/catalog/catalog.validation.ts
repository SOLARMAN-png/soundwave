import { z } from "zod";

export const catalogListQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["recent", "release"]).optional(),
});

export const catalogIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");
