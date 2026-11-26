import { z } from 'zod';
import { roleIdSchema, roleSummary } from './access';
import { emailSchema, nameSchema, passwordSchema, publicUser } from './auth';

/* ---------- members ---------- */

export const membersResponse = z.object({ members: z.array(publicUser) });
export type MembersResponse = z.infer<typeof membersResponse>;

/* ---------- invites ---------- */

export const createInviteInput = z.object({ email: emailSchema, roleId: roleIdSchema });
export type CreateInviteInput = z.infer<typeof createInviteInput>;

export const invite = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSummary,
  invitedBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Invite = z.infer<typeof invite>;

export const inviteResponse = z.object({ invite });
export const invitesResponse = z.object({ invites: z.array(invite) });

/** What the public invite page may show before the person signs up. */
export const invitePreview = z.object({
  email: z.string(),
  role: roleSummary,
  invitedByName: z.string(),
  expiresAt: z.string(),
});
export type InvitePreview = z.infer<typeof invitePreview>;

export const acceptInviteInput = z.object({ name: nameSchema, password: passwordSchema });
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;
