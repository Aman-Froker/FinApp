import type { RefreshBody, SignInBody, SignUpBody } from '@finapp/shared';
import type { Request, Response } from 'express';

import { authService } from './auth.service.js';

export const authController = {
  async signUp(req: Request<unknown, unknown, SignUpBody>, res: Response) {
    res.status(201).json(await authService.signUp(req.body.email, req.body.password));
  },
  async signIn(req: Request<unknown, unknown, SignInBody>, res: Response) {
    res.json(await authService.signIn(req.body.email, req.body.password));
  },
  async refresh(req: Request<unknown, unknown, RefreshBody>, res: Response) {
    res.json({ tokens: await authService.refresh(req.body.refreshToken) });
  },
  async signOut(req: Request<unknown, unknown, RefreshBody>, res: Response) {
    await authService.signOut(req.body.refreshToken);
    res.status(204).end();
  },
};
