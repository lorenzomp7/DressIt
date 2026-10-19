import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  /** Optional override of the Gemini endpoint (e.g. a corporate proxy or a local mock). */
  GEMINI_BASE_URL: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  CLOUDINARY_URL: z.string().optional(),
  PUBLIC_API_URL: z.string().optional(),
  RENDER_EXTERNAL_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default("uploads"),
  /** Comma-separated emails that get the admin role (no admin password lives in the code). */
  ADMIN_EMAILS: z.string().default(""),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

/** Render exposes hosts without scheme when wired with `fromService.property: host`. */
function toOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const config = {
  ...env,
  isProduction: env.NODE_ENV === "production",
  corsOrigins: env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (o.startsWith("http://localhost") ? o : toOrigin(o))),
  publicApiUrl: toOrigin(
    env.PUBLIC_API_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT}`,
  ),
  useCloudinary: Boolean(env.CLOUDINARY_URL),
  adminEmails: new Set(
    env.ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
};
