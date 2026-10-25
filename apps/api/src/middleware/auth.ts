import type { NextFunction, Request, Response } from 'express';

import { AuthError } from '../lib/errors.js';
import { verifyAccessToken, verifyDeviceToken } from '../lib/tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    deviceId?: string;
  }
}

function bearer(req: Request): string {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AuthError();
  return token;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.userId = (await verifyAccessToken(bearer(req))).userId;
  next();
}

export async function requireDevice(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.deviceId = (await verifyDeviceToken(bearer(req))).deviceId;
  next();
}
