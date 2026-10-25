import { z } from 'zod';

import { userSchema } from './user';

export const emailSchema = z.email('Enter a valid email address').trim().toLowerCase().max(254);

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

export const signUpBodySchema = z.object({ email: emailSchema, password: passwordSchema });
export const signInBodySchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const refreshBodySchema = z.object({ refreshToken: z.string().min(20).max(512) });

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  // Seconds until the access token expires.
  expiresIn: z.number().int().positive(),
});

export const authResponseSchema = z.object({ user: userSchema, tokens: tokenPairSchema });

export type SignUpBody = z.infer<typeof signUpBodySchema>;
export type SignInBody = z.infer<typeof signInBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
