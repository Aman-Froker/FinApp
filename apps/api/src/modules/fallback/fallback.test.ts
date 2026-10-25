import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { FallbackRequestModel } from '../../models/fallback-request.js';
import { amountsIn } from '@finapp/parser';

import type { Extractor } from './extractor.js';

const body = { sender: 'VM-NEWBNK-S', text: 'Rs 1,250.00 has gone out of A/C XXXX to Zepto. Bal [masked]', templateKey: 'k' };
const fake: Extractor = {
  extract: vi.fn(async () => ({ type: 'debit' as const, amountMinor: 125000, counterparty: 'Zepto', instrument: 'other' as const, status: 'success' as const })),
};

async function device(app: ReturnType<typeof createApp>) {
  const { body: reg } = await request(app).post('/v1/devices').send({ platform: 'android', appVersion: '1.0.0' });
  return { Authorization: `Bearer ${reg.token}`, deviceId: reg.deviceId as string };
}

describe('parse fallback', () => {
  test('returns the model extraction and keeps the masked text for rule writing', async () => {
    const app = createApp({ extractor: fake });
    const { deviceId, ...auth } = await device(app);
    const res = await request(app).post('/v1/parse/fallback').set(auth).send(body);
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ amountMinor: 125000, counterparty: 'Zepto' });
    expect(await FallbackRequestModel.countDocuments({ deviceId, maskedText: body.text })).toBe(1);
  });

  test('stops at the monthly cap per device', async () => {
    const app = createApp({ extractor: fake });
    const { deviceId, ...auth } = await device(app);
    await FallbackRequestModel.insertMany(Array.from({ length: env.FALLBACK_MONTHLY_CAP }, () => ({ deviceId, sender: 's', templateKey: 'k', maskedText: 't' })));
    const res = await request(app).post('/v1/parse/fallback').set(auth).send(body);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('fallback_cap_reached');
  });

  test('answers 503 when no model is configured, and requires a device token', async () => {
    const app = createApp({ extractor: null });
    const { deviceId: _id, ...auth } = await device(app);
    expect((await request(app).post('/v1/parse/fallback').set(auth).send(body)).status).toBe(503);
    expect((await request(app).post('/v1/parse/fallback').send(body)).status).toBe(401);
  });
});

test('an amount is only accepted if the message actually contains it', () => {
  const found = amountsIn('Rs 1,250.00 debited, ref [n], 2 items');
  expect(found.has(125000)).toBe(true);
  expect(found.has(200)).toBe(true);
  expect(found.has(130000)).toBe(false);
});
