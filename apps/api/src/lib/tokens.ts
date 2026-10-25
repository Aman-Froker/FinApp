import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { env } from '../config/env.js';
import { AuthError } from './errors.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

// User and device tokens share the key, so the audience keeps one from passing as the other.
type Audience = 'user' | 'device';

async function sign(subject: string, aud: Audience, ttl: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setAudience(aud)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

async function verify(token: string, aud: Audience): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], audience: aud });
    if (!payload.sub) throw new Error('no subject');
    return payload.sub;
  } catch {
    throw new AuthError('invalid_token', 'Invalid or expired access token');
  }
}

export const signAccessToken = (userId: string) => sign(userId, 'user', `${env.ACCESS_TOKEN_TTL_SECONDS}s`);
export const verifyAccessToken = async (token: string) => ({ userId: await verify(token, 'user') });

// shortcut: anonymous device tokens live a year and are not rotated, they only reach events, fallback and delete; add rotation when a device token can read user data
export const signDeviceToken = (deviceId: string) => sign(deviceId, 'device', '365d');
export const verifyDeviceToken = async (token: string) => ({ deviceId: await verify(token, 'device') });

// Refresh tokens are opaque random strings; only their SHA-256 is stored.
export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
