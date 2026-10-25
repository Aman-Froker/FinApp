import { refreshBodySchema, signInBodySchema, signUpBodySchema } from '@finapp/shared';
import { Router } from 'express';

import { authLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';

export const authRouter = Router();

authRouter.use(authLimiter);
authRouter.post('/sign-up', validate({ body: signUpBodySchema }), authController.signUp);
authRouter.post('/sign-in', validate({ body: signInBodySchema }), authController.signIn);
authRouter.post('/refresh', validate({ body: refreshBodySchema }), authController.refresh);
authRouter.post('/sign-out', validate({ body: refreshBodySchema }), authController.signOut);
