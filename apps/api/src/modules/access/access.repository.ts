import type { PermissionKey, RoleId } from '@taskflow/core';
import type { NewUser, UserRecord } from '../auth/auth.repository';

export type RoleRecord = {
  id: RoleId;
  name: string;
  /** In display order. */
  permissions: PermissionKey[];
  memberCount: number;
};

export interface RoleRepository {
  /** All roles in display order, with their permissions and member counts. */
  list(): Promise<RoleRecord[]>;
  permissionsOf(roleId: RoleId): Promise<PermissionKey[]>;
  setPermission(roleId: RoleId, key: PermissionKey, granted: boolean): Promise<void>;
}

export type InviteRecord = {
  id: string;
  email: string;
  roleId: RoleId;
  tokenHash: string;
  invitedBy: { id: string; name: string };
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type NewInvite = { email: string; roleId: RoleId; tokenHash: string; invitedById: string; expiresAt: Date };

/** Open = not accepted, not revoked, not expired. */
export const isOpen = (invite: InviteRecord, at: Date) =>
  invite.acceptedAt === null && invite.revokedAt === null && invite.expiresAt.getTime() > at.getTime();

export interface InviteRepository {
  /** Revokes any unused invite for the same email, then stores the new one (atomically). */
  replaceOpen(data: NewInvite, at: Date): Promise<InviteRecord>;
  /** Open invites, newest first. */
  listOpen(at: Date): Promise<InviteRecord[]>;
  findById(id: string): Promise<InviteRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InviteRecord | null>;
  /** Returns false if there was no unused invite with this id. */
  revoke(id: string, at: Date): Promise<boolean>;
  /** Gives an open invite a new token and expiry (the old link stops working). Null if not open. */
  renew(id: string, at: Date, tokenHash: string, expiresAt: Date): Promise<InviteRecord | null>;
  /**
   * Marks the invite accepted and creates the user with the invite's role, in one transaction.
   * 'unavailable' if the invite was used, revoked or expired; 'email_taken' if the email already has an account.
   */
  accept(id: string, at: Date, user: NewUser): Promise<UserRecord | 'unavailable' | 'email_taken'>;
}
