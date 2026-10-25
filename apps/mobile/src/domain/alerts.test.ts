import { alertsFor, plan, type Alert, type AlertInput } from './alerts';
import { detectRecurring, type Txn } from './detect';

let n = 0;
const txn = (date: string, amountMinor: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  date: new Date(date).toISOString(),
  amountMinor,
  direction: 'debit',
  kind: 'spend',
  status: 'success',
  instrument: 'upi',
  accountLast4: '1234',
  counterparty: 'GROCER',
  counterpartyVpa: null,
  ...over,
});
const now = new Date('2026-10-25T10:00:00');
const input = (over: Partial<AlertInput>): AlertInput => ({
  txns: [],
  recurring: [],
  balances: new Map(),
  statements: [],
  mandates: [],
  safe: null,
  onboardedAt: new Date('2026-10-20T00:00:00'),
  ...over,
});
const types = (a: Alert[]) => a.map((x) => [x.type, x.fireAt?.toISOString() ?? 'now']);

test('bounce risk: a regular debit bigger than the last balance, 3 days and 1 day before it is due', () => {
  const txns = [
    txn('2026-09-01T09:00:00', 20_000_00, { counterparty: 'RENT', instrument: 'nach' }),
    txn('2026-10-01T09:00:00', 20_000_00, { counterparty: 'RENT', instrument: 'nach' }),
  ];
  const balances = new Map([['1234', { balanceMinor: 12_000_00, asOf: '2026-10-24T09:00:00Z' }]]);
  const out = alertsFor(input({ txns, recurring: detectRecurring(txns), balances }), now);
  expect(types(out)).toEqual([
    ['bounce', new Date('2026-10-29T09:00:00').toISOString()],
    ['bounce', new Date('2026-10-31T09:00:00').toISOString()],
  ]);
  const enough = new Map([['1234', { balanceMinor: 25_000_00, asOf: '2026-10-24T09:00:00Z' }]]);
  expect(alertsFor(input({ txns, recurring: detectRecurring(txns), balances: enough }), now)).toEqual([]);
});

test('card due: 5 days and 1 day before, and nothing once a payment for the card arrives', () => {
  const statements = [{ id: 's1', accountLast4: '5678', totalDueMinor: 18_450_00, minDueMinor: 920_00, dueDate: '2026-11-05', receivedAt: '2026-10-15T09:00:00Z' }];
  expect(types(alertsFor(input({ statements }), now))).toEqual([
    ['card_due', new Date('2026-10-31T09:00:00').toISOString()],
    ['card_due', new Date('2026-11-04T09:00:00').toISOString()],
  ]);
  const payment = txn('2026-10-24T09:00:00', 18_450_00, { kind: 'transfer', accountLast4: '5678' });
  expect(alertsFor(input({ statements, txns: [payment] }), now)).toEqual([]);
});

test('new autopay and price hike fire straight away, only for messages after onboarding', () => {
  const mandates = [
    { id: 'm1', payee: 'NETFLIX', amountMinor: 649_00, receivedAt: '2026-10-25T08:00:00Z' },
    { id: 'm0', payee: 'OLD GYM', amountMinor: null, receivedAt: '2026-05-01T08:00:00Z' },
  ];
  const txns = [txn('2026-09-24T09:00:00', 499_00, { counterparty: 'SPOTIFY' }), txn('2026-10-24T09:00:00', 599_00, { counterparty: 'SPOTIFY' })];
  const out = alertsFor(input({ mandates, txns }), now);
  expect(types(out)).toEqual([
    ['new_autopay', 'now'],
    ['price_hike', 'now'],
  ]);
  expect(out[1]!.body).toBe('₹599.00 this time, up from ₹499.00 on 24 Sept.');
});

test('stuck refund: a failed or flagged debit with no matching credit, 72 hours after', () => {
  const failed = txn('2026-10-24T09:00:00', 2_450_00, { status: 'failed', counterparty: 'IRCTC' });
  const flagged = { ...txn('2026-10-21T09:00:00', 999_00, { counterparty: 'MYNTRA' }), refundExpected: true };
  const refunded = txn('2026-10-23T09:00:00', 300_00, { status: 'failed' });
  const back = txn('2026-10-24T09:00:00', 300_00, { direction: 'credit', kind: 'refund', status: 'refund' });
  expect(types(alertsFor(input({ txns: [failed, flagged, refunded, back] }), now))).toEqual([
    ['stuck_refund', new Date('2026-10-27T09:00:00').toISOString()],
    ['stuck_refund', 'now'],
  ]);
});

const alert = (key: string, type: Alert['type'], fireAt: Date | null = null): Alert => ({ key, type, fireAt, title: '', body: '', txnIds: [] });

test('two alerts a day at most; bounce and card due always send and count towards the two', () => {
  const planned = [{ key: 'a', fireAt: now.toISOString(), suppressed: false }];
  const r = plan([alert('a', 'price_hike'), alert('b', 'new_autopay'), alert('c', 'stuck_refund'), alert('d', 'bounce', now)], planned, now);
  expect(r.schedule.map((a) => a.key)).toEqual(['d']);
  expect(r.suppress.map((a) => a.key)).toEqual(['b', 'c']);
  const quiet = plan([alert('b', 'new_autopay'), alert('c', 'stuck_refund'), alert('e', 'price_hike')], [], now);
  expect([quiet.schedule.map((a) => a.key), quiet.suppress.map((a) => a.key)]).toEqual([['b', 'c'], ['e']]);
});

test('a planned future alert that is no longer wanted is cancelled', () => {
  const later = new Date('2026-10-29T09:00:00').toISOString();
  const r = plan([], [{ key: 'bounce:x', fireAt: later, suppressed: false }, { key: 'old', fireAt: '2026-10-01T09:00:00Z', suppressed: false }], now);
  expect(r.cancel).toEqual(['bounce:x']);
});
