/**
 * The auth module talks to storage only through these interfaces.
 * Production uses Prisma (prisma-auth.repository.ts); tests use an in-memory store with dummy data.
 */

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

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
  /** Throws EmailTakenError if the email exists. */
  create(data: { name: string; email: string; passwordHash: string }): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
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

export type AuthRepositories = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
};
