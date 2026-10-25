import { nextAsk, unknownSpend, type AskContext, type AskState } from './asks';
import type { Txn } from './detect';

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
  counterparty: null,
  counterpartyVpa: null,
  ...over,
});
const now = new Date('2026-10-25T10:00:00');
const ctx = (over: Partial<AskContext>): AskContext => ({
  openDays: 0,
  daysSinceOnboarding: 0,
  unknownPayees: [],
  unknownMinor: 0,
  spendMinor: 0,
  notificationAccess: false,
  hasGoal: false,
  ...over,
});
const payee = { vpa: 'q123@ybl', totalMinor: 5_000_00, count: 3 };

test('unknown spend is what went to a bare UPI ID in the last 90 days, top payees first', () => {
  const txns = [
    txn('2026-10-20', 3_000_00, { counterpartyVpa: 'q123@ybl' }),
    txn('2026-10-21', 2_000_00, { counterpartyVpa: 'q123@ybl' }),
    txn('2026-10-22', 4_000_00, { counterpartyVpa: 'paytmqr9@paytm' }),
    txn('2026-10-22', 1_000_00, { counterparty: 'SWIGGY', counterpartyVpa: 'swiggy@icici' }),
    txn('2026-05-01', 9_000_00, { counterpartyVpa: 'old@ybl' }),
  ];
  expect(unknownSpend(txns, now)).toEqual({
    unknownPayees: [
      { vpa: 'q123@ybl', totalMinor: 5_000_00, count: 2 },
      { vpa: 'paytmqr9@paytm', totalMinor: 4_000_00, count: 1 },
    ],
    unknownMinor: 9_000_00,
    spendMinor: 10_000_00,
  });
});

test('each ask waits for its own trigger, in journey order, and never before the app has shown value', () => {
  expect(nextAsk(ctx({ openDays: 1, unknownPayees: [payee] }), [], now)).toBeNull();
  expect(nextAsk(ctx({ openDays: 2, unknownPayees: [payee] }), [], now)?.type).toBe('label_payees');
  expect(nextAsk(ctx({ unknownMinor: 30_00, spendMinor: 100_00 }), [], now)?.type).toBe('notification_access');
  expect(nextAsk(ctx({ unknownMinor: 30_00, spendMinor: 100_00, notificationAccess: true }), [], now)).toBeNull();
  expect(nextAsk(ctx({ daysSinceOnboarding: 6 }), [], now)).toBeNull();
  expect(nextAsk(ctx({ daysSinceOnboarding: 7 }), [], now)).toEqual({ type: 'goal', trigger: 'week:1' });
  expect(nextAsk(ctx({ daysSinceOnboarding: 7, hasGoal: true }), [], now)).toBeNull();
});

test('a declined ask returns only after 14 days and only on a new trigger; an accepted one never', () => {
  const declined = (at: string, trigger: string): AskState[] => [{ type: 'goal', acceptedAt: null, declinedAt: at, declinedTrigger: trigger }];
  const c = ctx({ daysSinceOnboarding: 21 });
  // Week 3 trigger, declined in week 1, 14 days ago: shows.
  expect(nextAsk(c, declined('2026-10-11T10:00:00', 'week:1'), now)?.trigger).toBe('week:3');
  // Declined 13 days ago: waits.
  expect(nextAsk(c, declined('2026-10-12T10:00:00', 'week:1'), now)).toBeNull();
  // Same trigger as the one declined: waits for a new one, however long ago.
  expect(nextAsk(c, declined('2026-09-01T10:00:00', 'week:3'), now)).toBeNull();
  expect(nextAsk(c, [{ type: 'goal', acceptedAt: '2026-10-01T10:00:00', declinedAt: null, declinedTrigger: null }], now)).toBeNull();
});
