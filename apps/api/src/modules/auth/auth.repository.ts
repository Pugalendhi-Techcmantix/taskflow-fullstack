import type { RoleId } from '@taskflow/core';

/**
 * The auth module talks to storage only through these interfaces.
 * Production uses Prisma (prisma-auth.repository.ts); tests use an in-memory store with dummy data.
 */

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roleId: RoleId;
  createdAt: Date;
  updatedAt: Date;
};

export type NewUser = { name: string; email: string; passwordHash: string };

/** How a new account gets its role. */
export type RoleAssignment =
  | { kind: 'fixed'; roleId: RoleId } // e.g. the role chosen in an invite
  | { kind: 'firstUserIsAdmin'; others: RoleId }; // public sign-up

export type ChangeRoleResult = 'changed' | 'not_found' | 'last_admin';

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

/** Thrown by UserRepository.create when the email is already registered. */
export class EmailTakenError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailTakenError';
  }
}

export interface UserRepository {
  /** Throws EmailTakenError if the email exists. The first-user rule is applied atomically. */
  create(data: NewUser, role: RoleAssignment): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** All users, oldest first. */
  list(): Promise<UserRecord[]>;
  /** Changes a user's role, refusing (atomically) to remove the last Admin. */
  changeRole(userId: string, roleId: RoleId): Promise<ChangeRoleResult>;
}

export type NewRefreshToken = { userId: string; familyId: string; tokenHash: string; expiresAt: Date };

export interface RefreshTokenRepository {
  create(data: NewRefreshToken): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Atomically revokes token `id` and stores its replacement — but only if `id` is not revoked yet.
   * Returns false (and stores nothing) if another request rotated it first.
   */
  rotate(id: string, at: Date, replacement: NewRefreshToken): Promise<boolean>;
  /** True if the login (family) still has a token that is neither revoked nor expired. */
  hasActiveInFamily(familyId: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
}
