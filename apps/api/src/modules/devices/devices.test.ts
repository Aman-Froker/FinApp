import request from 'supertest';
import { describe, expect, test } from 'vitest';

import { createApp } from '../../app.js';
import { EventModel } from '../../models/event.js';
import { FallbackRequestModel } from '../../models/fallback-request.js';

const app = createApp();
const register = () => request(app).post('/v1/devices').send({ platform: 'android', appVersion: '1.0.0' });
const event = { name: 'permission_sms_granted', properties: { step: 2 }, occurredAt: '2026-10-25T08:00:00.000Z' };

describe('devices', () => {
  test('registers an anonymous device and accepts events', async () => {
    const reg = await register();
    expect(reg.status).toBe(201);
    const res = await request(app).post('/v1/events').set('Authorization', `Bearer ${reg.body.token}`).send({ events: [event] });
    expect(res.status).toBe(202);
    expect(await EventModel.countDocuments({ deviceId: reg.body.deviceId })).toBe(1);
  });

  test('rejects nested event properties and bad names', async () => {
    const { body } = await register();
    const auth = { Authorization: `Bearer ${body.token}` };
    const nested = await request(app).post('/v1/events').set(auth).send({ events: [{ ...event, properties: { sms: { body: 'x' } } }] });
    expect(nested.status).toBe(400);
    const badName = await request(app).post('/v1/events').set(auth).send({ events: [{ ...event, name: 'Bad Name' }] });
    expect(badName.status).toBe(400);
  });

  test('delete-all removes the device and its events and stops further writes', async () => {
    const { body } = await register();
    const auth = { Authorization: `Bearer ${body.token}` };
    await request(app).post('/v1/events').set(auth).send({ events: [event, event] });
    await FallbackRequestModel.create({ deviceId: body.deviceId, sender: 's', templateKey: 'k', maskedText: 't' });
    expect((await request(app).delete('/v1/devices/me').set(auth)).status).toBe(204);
    expect(await EventModel.countDocuments({ deviceId: body.deviceId })).toBe(0);
    expect(await FallbackRequestModel.countDocuments({ deviceId: body.deviceId })).toBe(0);
    const after = await request(app).post('/v1/events').set(auth).send({ events: [event] });
    expect(after.status).toBe(401);
  });

  test('device and user tokens are not interchangeable', async () => {
    const { body } = await register();
    expect((await request(app).get('/v1/me').set('Authorization', `Bearer ${body.token}`)).status).toBe(401);
    const user = await request(app).post('/v1/auth/sign-up').send({ email: 'a@example.com', password: 'correct horse battery' });
    const asDevice = await request(app)
      .post('/v1/events')
      .set('Authorization', `Bearer ${user.body.tokens.accessToken}`)
      .send({ events: [event] });
    expect(asDevice.status).toBe(401);
  });
});
