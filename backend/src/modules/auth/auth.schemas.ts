import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8).max(100),
    role: z.literal("student").default("student"),
    studentProfile: z
      .object({
        studentCode: z.string().min(2).max(40).optional(),
        department: z.string().min(2).max(120).default("General"),
        semester: z.coerce.number().int().min(1).max(12).default(1)
      })
      .optional(),
    instructorProfile: z
      .object({
        specialization: z.string().min(2).max(160).default("General Education")
      })
      .optional()
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  })
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(20).optional()
  })
});
