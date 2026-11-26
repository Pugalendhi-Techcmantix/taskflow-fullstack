import { z } from 'zod';
import { permissionKeySchema, roleSummary } from './access';

/** bcrypt only uses the first 72 bytes of a password, so longer ones are rejected instead of silently truncated. */
const MAX_PASSWORD_BYTES = 72;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((s) => byteLength(s) <= MAX_PASSWORD_BYTES, 'Password is too long');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name')
  .max(60, 'Use at most 60 characters');

export const loginInput = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Enter your password')
    .refine((s) => byteLength(s) <= MAX_PASSWORD_BYTES, 'Password is too long'),
});
export type LoginInput = z.infer<typeof loginInput>;

export const registerInput = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerInput>;

/** What the API is allowed to reveal about a user. Never includes the password hash. */
export const publicUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSummary,
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUser>;

/** The signed-in user plus what their role may do (drives `can()` in the UI). */
export const sessionUser = z.object({
  user: publicUser,
  permissions: z.array(permissionKeySchema),
});
export type SessionUser = z.infer<typeof sessionUser>;

export const authResponse = sessionUser.extend({
  accessToken: z.string().min(1),
});
export type AuthResponse = z.infer<typeof authResponse>;
