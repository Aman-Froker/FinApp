import { createHash } from 'node:crypto';

import { inboundAckBodySchema, inboundEmailSchema, type InboundAckBody } from '@finapp/shared';
import express, { Router, type Request } from 'express';

import { env } from '../../config/env.js';
import { AppError, AuthError, ValidationError } from '../../lib/errors.js';
import { requireDevice } from '../../middleware/auth.js';
import { globalLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { DeviceModel } from '../../models/device.js';
import { InboundItemModel } from '../../models/inbound-item.js';
import { extract, newInboxToken, signatureValid, tokenOf } from './inbound.service.js';

const unavailable = () => new AppError(503, 'email_unavailable', 'Email forwarding is not set up on this server');

// Mounted before the app-wide JSON parser: the signature covers the raw bytes, and bank emails are
// bigger than the 100 kB API limit.
export const inboundWebhook = Router();

inboundWebhook.post('/', globalLimiter, express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (!env.INBOUND_SECRET) throw unavailable();
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !signatureValid(raw, req.header('x-inbound-signature'), env.INBOUND_SECRET)) {
    throw new AuthError('bad_signature', 'Signature does not match');
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ValidationError([{ path: '', message: 'Body is not JSON' }]);
  }
  const parsed = inboundEmailSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const email = parsed.data;
  const token = tokenOf(email.to);
  const device = token ? await DeviceModel.findOne({ inboxToken: token }, { deviceId: 1 }).lean() : null;
  const payload = device ? extract(email) : null;
  // Unknown addresses and emails that are not bank alerts get the same answer, and nothing is kept.
  if (device && payload) {
    await InboundItemModel.updateOne(
      // Hashed: the Message-ID names the sender, and only equality is needed to skip a repeat.
      { deviceId: device.deviceId, messageId: createHash('sha256').update(email.messageId).digest('hex') },
      { $setOnInsert: { payload, receivedAt: new Date(email.receivedAt) } },
      { upsert: true },
    );
  }
  req.log.info({ stored: Boolean(device && payload), kind: payload?.kind }, 'inbound email');
  res.status(202).end();
});

export const inboundRouter = Router();

inboundRouter.get('/inbound/address', requireDevice, async (req, res) => {
  if (!env.INBOUND_DOMAIN) throw unavailable();
  const device = await DeviceModel.findOne({ deviceId: req.deviceId }, { inboxToken: 1 });
  if (!device) throw new AuthError('device_deleted', 'Device not registered');
  if (!device.inboxToken) {
    device.inboxToken = newInboxToken();
    await device.save();
  }
  res.json({ address: `${device.inboxToken}@${env.INBOUND_DOMAIN}` });
});

inboundRouter.get('/inbound/items', requireDevice, async (req, res) => {
  const items = await InboundItemModel.find({ deviceId: req.deviceId }).sort({ receivedAt: 1 }).limit(100).lean();
  res.json({ items: items.map((i) => ({ id: String(i._id), receivedAt: i.receivedAt.toISOString(), payload: i.payload })) });
});

// The phone acknowledges what it stored; only then is it deleted here.
inboundRouter.post('/inbound/items/ack', requireDevice, validate({ body: inboundAckBodySchema }), async (req: Request<unknown, unknown, InboundAckBody>, res) => {
  await InboundItemModel.deleteMany({ deviceId: req.deviceId, _id: { $in: req.body.ids.filter((id) => /^[a-f0-9]{24}$/.test(id)) } });
  res.status(204).end();
});
