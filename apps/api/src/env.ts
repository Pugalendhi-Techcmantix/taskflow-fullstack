import 'dotenv/config';
import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))
  .optional();

/** Environment is validated once at startup: a missing or bad value stops the server with a clear message. */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    DATABASE_URL: z.string().startsWith('postgresql://', 'DATABASE_URL must be a postgresql:// URL'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    CORS_ORIGIN: z.string().default('http://localhost:5200'),
    /** Public address of the web app; invite links point here. */
    APP_URL: z.url().default('http://localhost:5200'),
    INVITE_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    /** Email (SMTP). Leave SMTP_HOST empty in development to print emails to the terminal instead. */
    SMTP_HOST: optionalText,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: optionalText,
    SMTP_PASS: optionalText,
    MAIL_FROM: z.string().default('TaskFlow <no-reply@localhost>'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.SMTP_HOST !== undefined, {
    message: 'SMTP_HOST is required in production (invite emails must really be sent)',
    path: ['SMTP_HOST'],
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
