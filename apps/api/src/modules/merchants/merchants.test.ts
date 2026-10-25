import request from 'supertest';
import { describe, expect, test } from 'vitest';

import { createApp } from '../../app.js';
import { MerchantLabelModel } from '../../models/merchant-label.js';

const app = createApp();
const device = async () => {
  const { body } = await request(app).post('/v1/devices').send({ platform: 'android', appVersion: '1.0.0' });
  return { Authorization: `Bearer ${body.token}` };
};
const hash = 'a'.repeat(64);
const other = 'b'.repeat(64);
const label = (name: string, category = 'Groceries') => ({ labels: [{ hash, name, category }] });
const lookup = (auth: Record<string, string>) => request(app).post('/v1/merchants/lookup').set(auth).send({ hashes: [hash, other] });

describe('shared merchant map', () => {
  test('a name is served only once three different devices agree on it', async () => {
    const [a, b, c] = [await device(), await device(), await device()];
    await request(app).post('/v1/merchants/labels').set(a).send(label('Sharma General Store'));
    await request(app).post('/v1/merchants/labels').set(b).send(label('SHARMA GENERAL STORE'));
    expect((await lookup(a)).body).toEqual({ merchants: [] });
    // Relabelling replaces a device's own vote rather than adding a second one.
    await request(app).post('/v1/merchants/labels').set(b).send(label('Sharma General Store'));
    expect((await lookup(a)).body).toEqual({ merchants: [] });
    await request(app).post('/v1/merchants/labels').set(c).send(label('Sharma General Store'));
    expect((await lookup(a)).body).toEqual({ merchants: [{ hash, name: 'Sharma General Store', category: 'Groceries' }] });
  });

  test('clear UPI IDs, payments to people and anonymous callers are refused', async () => {
    const a = await device();
    const clear = await request(app).post('/v1/merchants/labels').set(a).send({ labels: [{ hash: 'shop@ybl', name: 'Shop', category: 'Shopping' }] });
    expect(clear.status).toBe(400);
    expect((await request(app).post('/v1/merchants/labels').set(a).send(label('Mum', 'Family and friends'))).status).toBe(400);
    expect((await request(app).post('/v1/merchants/lookup').send({ hashes: [hash] })).status).toBe(401);
  });

  test("delete-all removes the device's labels", async () => {
    const a = await device();
    await request(app).post('/v1/merchants/labels').set(a).send(label('Corner Shop'));
    expect(await MerchantLabelModel.countDocuments()).toBe(1);
    await request(app).delete('/v1/devices/me').set(a);
    expect(await MerchantLabelModel.countDocuments()).toBe(0);
  });
});
