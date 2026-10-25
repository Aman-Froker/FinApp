import { merchantLabelsBodySchema, merchantLookupBodySchema, type MerchantLabelsBody, type MerchantLookupBody } from '@finapp/shared';
import { Router, type Request } from 'express';

import { requireDevice } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { merchantsRepository } from './merchants.repository.js';

export const merchantsRouter = Router();

// POST, not GET with the hashes in the query, so they stay out of access logs.
merchantsRouter.post('/merchants/lookup', requireDevice, validate({ body: merchantLookupBodySchema }), async (req: Request<unknown, unknown, MerchantLookupBody>, res) => {
  res.json({ merchants: await merchantsRepository.lookup(req.body.hashes) });
});

merchantsRouter.post('/merchants/labels', requireDevice, validate({ body: merchantLabelsBodySchema }), async (req: Request<unknown, unknown, MerchantLabelsBody>, res) => {
  await merchantsRepository.vote(req.deviceId!, req.body.labels);
  res.status(202).end();
});
