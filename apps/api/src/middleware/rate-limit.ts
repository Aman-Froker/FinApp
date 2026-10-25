import { rateLimit } from 'express-rate-limit';

import { env } from '../config/env.js';

const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Integration tests hit the auth routes dozens of times from one address.
  skip: () => env.NODE_ENV === 'test',
} as const;

export const globalLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 300 });

// Credential endpoints: brute force protection.
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 10 });

// Model calls cost money; stricter per IP, and per user limits live in the AI service.
export const aiLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 20 });
