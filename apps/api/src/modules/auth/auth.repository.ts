import { RefreshTokenModel } from '../../models/refresh-token.js';

export const refreshTokensRepository = {
  create: (input: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) =>
    RefreshTokenModel.create(input),
  findByHash: (tokenHash: string) => RefreshTokenModel.findOne({ tokenHash }),
  revoke: (tokenHash: string) =>
    RefreshTokenModel.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() }),
  revokeFamily: (familyId: string) =>
    RefreshTokenModel.updateMany({ familyId, revokedAt: null }, { revokedAt: new Date() }),
};
