import type { User } from '@finapp/shared';

import { UserModel } from '../../models/user.js';

export const usersRepository = {
  create: (email: string, passwordHash: string) => UserModel.create({ email, passwordHash }),
  findByEmail: (email: string) => UserModel.findOne({ email: email.toLowerCase() }),
  findById: (id: string) => UserModel.findById(id),
};

export function toUserDto(user: { _id: unknown; email: string; createdAt?: Date }): User {
  return { id: String(user._id), email: user.email, createdAt: (user.createdAt ?? new Date()).toISOString() };
}
