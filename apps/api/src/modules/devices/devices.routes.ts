import { randomUUID } from 'node:crypto';

import { eventsBodySchema, registerDeviceBodySchema, type EventsBody, type RegisterDeviceBody } from '@finapp/shared';
import { Router, type Request } from 'express';

import { AuthError } from '../../lib/errors.js';
import { signDeviceToken } from '../../lib/tokens.js';
import { requireDevice } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { devicesRepository } from './devices.repository.js';

export const devicesRouter = Router();

devicesRouter.post('/devices', validate({ body: registerDeviceBodySchema }), async (req: Request<unknown, unknown, RegisterDeviceBody>, res) => {
  const deviceId = randomUUID();
  await devicesRepository.create(deviceId, req.body);
  res.status(201).json({ deviceId, token: await signDeviceToken(deviceId) });
});

devicesRouter.post('/events', requireDevice, validate({ body: eventsBodySchema }), async (req: Request<unknown, unknown, EventsBody>, res) => {
  // A token for a deleted device must not keep writing data.
  if (!(await devicesRepository.exists(req.deviceId!))) throw new AuthError('device_deleted', 'Device not registered');
  await devicesRepository.addEvents(req.deviceId!, req.body.events);
  res.status(202).end();
});

devicesRouter.delete('/devices/me', requireDevice, async (req, res) => {
  await devicesRepository.deleteAll(req.deviceId!);
  req.log.info({ deviceId: req.deviceId }, 'device data deleted');
  res.status(204).end();
});
