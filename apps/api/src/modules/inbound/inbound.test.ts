import { readFileSync } from 'node:fs';

import request from 'supertest';
import { describe, expect, test } from 'vitest';

import { createApp } from '../../app.js';
import { InboundItemModel } from '../../models/inbound-item.js';
import { sign } from './inbound.service.js';

const app = createApp();
const SECRET = 'test-inbound-secret-at-least-32-characters';
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../fixtures/emails/${name}.json`, import.meta.url), 'utf8'));

async function device() {
  const { body } = await request(app).post('/v1/devices').send({ platform: 'android', appVersion: '1.0.0' });
  const auth = { Authorization: `Bearer ${body.token}` };
  const address = (await request(app).get('/v1/inbound/address').set(auth)).body.address as string;
  return { auth, address };
}

// What the Cloudflare Worker does: post the email as JSON, signed over the exact bytes.
const deliver = (email: object, secret = SECRET) => {
  const raw = JSON.stringify({ receivedAt: '2026-10-25T04:00:00.000Z', ...email });
  return request(app).post('/v1/inbound/email').set('content-type', 'application/json').set('x-inbound-signature', sign(raw, secret)).send(raw);
};

describe('email forwarding', () => {
  test('each device gets one stable, unguessable address', async () => {
    const { auth, address } = await device();
    expect(address).toMatch(/^[a-z2-7]{16}@in\.finapp\.test$/);
    expect((await request(app).get('/v1/inbound/address').set(auth)).body.address).toBe(address);
  });

  test('a forwarded HDFC card statement email becomes a statement for the phone, and nothing else is kept', async () => {
    const { auth, address } = await device();
    expect((await deliver({ ...fixture('hdfc-card-statement'), to: `Me <${address}>` })).status).toBe(202);
    const { body } = await request(app).get('/v1/inbound/items').set(auth);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].payload).toEqual({ kind: 'statement', accountLast4: '5678', totalDueMinor: 1845000, minDueMinor: 92000, dueDate: '2026-11-05' });
    // The stored item holds the parsed result only, never the email.
    const stored = await InboundItemModel.findOne().lean();
    expect(JSON.stringify(stored)).not.toMatch(/Dear Customer|hdfcbank\.net>/);
  });

  test('a debit alert email goes through the same parser as SMS', async () => {
    const { auth, address } = await device();
    await deliver({ ...fixture('hdfc-debit-alert'), to: address });
    const [item] = (await request(app).get('/v1/inbound/items').set(auth)).body.items;
    expect(item.payload).toMatchObject({ kind: 'transaction', type: 'debit', amountMinor: 149900, accountLast4: '4321', counterpartyVpa: 'bookmyshow@hdfcbank', referenceNo: '428192830555' });
  });

  test("Gmail's forwarding confirmation code reaches the phone, so the user can switch forwarding on", async () => {
    const { auth, address } = await device();
    await deliver({ ...fixture('gmail-confirmation'), to: address });
    const [item] = (await request(app).get('/v1/inbound/items').set(auth)).body.items;
    expect(item.payload).toEqual({ kind: 'gmail_confirmation', code: '481902734' });
  });

  test('the same email twice is stored once; acknowledged items are deleted', async () => {
    const { auth, address } = await device();
    await deliver({ ...fixture('hdfc-debit-alert'), to: address });
    await deliver({ ...fixture('hdfc-debit-alert'), to: address });
    const { items } = (await request(app).get('/v1/inbound/items').set(auth)).body;
    expect(items).toHaveLength(1);
    expect((await request(app).post('/v1/inbound/items/ack').set(auth).send({ ids: [items[0].id] })).status).toBe(204);
    expect((await request(app).get('/v1/inbound/items').set(auth)).body.items).toEqual([]);
  });

  test('a bad signature, an unknown address and a non-bank email store nothing', async () => {
    const { auth, address } = await device();
    expect((await deliver({ ...fixture('hdfc-debit-alert'), to: address }, 'wrong-secret-that-is-at-least-32-chars')).status).toBe(401);
    expect((await deliver({ ...fixture('hdfc-debit-alert'), to: 'aaaaaaaaaaaaaaaa@in.finapp.test' })).status).toBe(202);
    await deliver({ from: 'Mum <mum@example.com>', subject: 'Dinner', text: 'Paid 500 for the cake, come home', to: address, messageId: '<x@y>' });
    expect((await request(app).get('/v1/inbound/items').set(auth)).body.items).toEqual([]);
    expect(await InboundItemModel.countDocuments()).toBe(0);
  });

  test("delete-all removes the device's waiting items", async () => {
    const { auth, address } = await device();
    await deliver({ ...fixture('hdfc-debit-alert'), to: address });
    await request(app).delete('/v1/devices/me').set(auth);
    expect(await InboundItemModel.countDocuments()).toBe(0);
  });
});
