import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");

export const analyticsQuerySchema = z
  .object({
    period: z.enum(["7d", "30d", "3m", "6m", "12m", "all", "custom"]).default("30d"),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    granularity: z.enum(["day", "week", "month"]).default("day"),
  })
  .strict()
  .refine(
    ({ period, startDate, endDate }) =>
      period === "custom"
        ? Boolean(startDate && endDate && startDate <= endDate)
        : !startDate && !endDate,
    {
      message: "Custom periods require a valid startDate and endDate; other periods must not include dates",
    },
  );
