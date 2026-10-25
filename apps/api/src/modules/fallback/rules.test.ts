import { learnRule } from '@finapp/parser';
import request from 'supertest';
import { describe, expect, test } from 'vitest';

import { createApp } from '../../app.js';
import { LearnedRuleModel } from '../../models/learned-rule.js';

const app = createApp();
const device = async () => {
  const { body } = await request(app).post('/v1/devices').send({ platform: 'android', appVersion: '1.0.0' });
  return { Authorization: `Bearer ${body.token}` };
};
const rule = learnRule('KOTAKB', 'Sent Rs.199.00 from Kotak Bank AC X1234 to spotify.in@hdfcbank on 18-10-26.UPI Ref 629301234567.', {
  type: 'debit', amountMinor: 199_00, counterparty: 'spotify.in@hdfcbank', instrument: 'upi', status: 'success',
})!;
const send = (auth: Record<string, string>, rules: unknown[]) => request(app).post('/v1/parse/rules').set(auth).send({ rules });

describe('learned rules', () => {
  test('a rule is shared only once two devices sent it', async () => {
    const [a, b] = [await device(), await device()];
    expect((await send(a, [rule])).status).toBe(202);
    // Sending it again from the same phone is still one vote.
    await send(a, [rule]);
    expect((await request(app).get('/v1/parse/rules').set(a)).body).toEqual({ rules: [] });
    await send(b, [rule]);
    expect((await request(app).get('/v1/parse/rules').set(b)).body).toEqual({ rules: [rule] });
  });

  test('patterns that are not learned message shapes, and anonymous callers, are refused', async () => {
    const a = await device();
    expect((await send(a, [{ ...rule, pattern: '^(a+)+$' }])).status).toBe(400);
    expect((await send(a, [{ ...rule, header: 'not a header' }])).status).toBe(400);
    expect((await request(app).get('/v1/parse/rules')).status).toBe(401);
  });

  test("delete-all removes the device's rules", async () => {
    const a = await device();
    await send(a, [rule]);
    expect(await LearnedRuleModel.countDocuments()).toBe(1);
    await request(app).delete('/v1/devices/me').set(a);
    expect(await LearnedRuleModel.countDocuments()).toBe(0);
  });
});
