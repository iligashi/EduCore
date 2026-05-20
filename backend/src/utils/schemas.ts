import { z } from "zod";

export const idParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

export const optionalPaginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().optional()
  })
});

