import { safePattern } from '@finapp/parser';
import { fallbackRequestSchema, learnedRulesBodySchema, type FallbackRequest, type LearnedRulesBody } from '@finapp/shared';
import { Router, type Request } from 'express';

import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { requireDevice } from '../../middleware/auth.js';
import { aiLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { FallbackRequestModel } from '../../models/fallback-request.js';
import type { Extractor } from './extractor.js';
import { rulesRepository } from './rules.repository.js';

export function fallbackRouter(extractor: Extractor | null) {
  const router = Router();

  router.post(
    '/parse/fallback',
    aiLimiter,
    requireDevice,
    validate({ body: fallbackRequestSchema }),
    async (req: Request<unknown, unknown, FallbackRequest>, res) => {
      if (!extractor) throw new AppError(503, 'fallback_unavailable', 'Fallback parsing is not configured');
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const used = await FallbackRequestModel.countDocuments({ deviceId: req.deviceId, createdAt: { $gte: monthStart } });
      if (used >= env.FALLBACK_MONTHLY_CAP) {
        throw new AppError(429, 'fallback_cap_reached', 'Monthly fallback limit reached');
      }
      const transaction = await extractor.extract({ sender: req.body.sender, text: req.body.text });
      await FallbackRequestModel.create({
        deviceId: req.deviceId,
        sender: req.body.sender,
        templateKey: req.body.templateKey,
        maskedText: req.body.text,
        result: transaction,
      });
      res.json({ transaction });
    },
  );

  // Learned message shapes: phones send theirs and fetch the ones others agree on.
  router.post('/parse/rules', requireDevice, validate({ body: learnedRulesBodySchema }), async (req: Request<unknown, unknown, LearnedRulesBody>, res) => {
    if (!req.body.rules.every((r) => safePattern(r.pattern, r.groups))) throw new AppError(400, 'unsafe_rule', 'A rule is not a learned message shape');
    await rulesRepository.vote(req.deviceId!, req.body.rules);
    res.status(202).end();
  });

  router.get('/parse/rules', requireDevice, async (_req, res) => {
    res.json({ rules: await rulesRepository.shared() });
  });

  return router;
}
