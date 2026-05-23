import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(24).default("dev-access-secret-change-before-production"),
  JWT_REFRESH_SECRET: z.string().min(24).default("dev-refresh-secret-change-before-production"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  UPLOAD_DIR: z.string().default("uploads"),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default("root"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().default("educore"),
  MONGO_URI: z.string().default("mongodb://localhost:27017/educore"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
  GROQ_BASE_URL: z.string().url().optional().default("https://api.groq.com/openai/v1"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().optional().default("gpt-5"),
  OPENAI_BASE_URL: z.string().url().optional().default("https://api.openai.com/v1"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default("")
});

export const env = envSchema.parse({
  ...process.env,
  DB_PASSWORD: process.env.DB_PASSWORD ?? ""
});

export const isProduction = env.NODE_ENV === "production";
