import { Router } from 'express';

import { NotFoundError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { toUserDto, usersRepository } from './users.repository.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const user = await usersRepository.findById(req.userId!);
  if (!user) throw new NotFoundError('User');
  res.json({ user: toUserDto(user) });
});
