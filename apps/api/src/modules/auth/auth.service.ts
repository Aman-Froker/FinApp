import { randomUUID } from 'node:crypto';

import type { AuthResponse, TokenPair } from '@finapp/shared';
// The `argon2` package's prebuilt binary segfaults on this toolchain; this one is argon2id in Rust.
import { hash, verify } from '@node-rs/argon2';

import { env } from '../../config/env.js';
import { AuthError, ConflictError } from '../../lib/errors.js';
import { hashToken, newRefreshToken, signAccessToken } from '../../lib/tokens.js';
import { toUserDto, usersRepository } from '../users/users.repository.js';
import { refreshTokensRepository } from './auth.repository.js';

// OWASP's recommended parameters; argon2id is this library's default algorithm.
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

async function issueTokens(userId: string, familyId: string = randomUUID()): Promise<TokenPair> {
  const refreshToken = newRefreshToken();
  await refreshTokensRepository.create({
    userId,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  return {
    accessToken: await signAccessToken(userId),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

export const authService = {
  async signUp(email: string, password: string): Promise<AuthResponse> {
    if (await usersRepository.findByEmail(email)) {
      throw new ConflictError('email_taken', 'An account with this email already exists');
    }
    const user = await usersRepository.create(email, await hash(password, ARGON2));
    return { user: toUserDto(user), tokens: await issueTokens(String(user._id)) };
  },

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const user = await usersRepository.findByEmail(email);
    // shortcut: no dummy hash on unknown email, so timing differs; upgrade if account enumeration matters
    if (!user || !(await verify(user.passwordHash, password))) {
      throw new AuthError('invalid_credentials', 'Email or password is incorrect');
    }
    return { user: toUserDto(user), tokens: await issueTokens(String(user._id)) };
  },

  // Rotation with reuse detection: presenting an already rotated token kills the whole family.
  async refresh(refreshToken: string): Promise<TokenPair> {
    const row = await refreshTokensRepository.findByHash(hashToken(refreshToken));
    if (!row || row.expiresAt < new Date()) throw new AuthError('invalid_refresh_token', 'Sign in again');
    if (row.revokedAt) {
      await refreshTokensRepository.revokeFamily(row.familyId);
      throw new AuthError('refresh_token_reused', 'Session revoked, sign in again');
    }
    await refreshTokensRepository.revoke(row.tokenHash);
    return issueTokens(String(row.userId), row.familyId);
  },

  async signOut(refreshToken: string): Promise<void> {
    const row = await refreshTokensRepository.findByHash(hashToken(refreshToken));
    if (row) await refreshTokensRepository.revokeFamily(row.familyId);
  },
};
