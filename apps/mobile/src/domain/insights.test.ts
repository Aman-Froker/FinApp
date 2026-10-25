import { detectRecurring, type Txn } from './detect';
import { scoreInsight, summary, wrapped } from './insights';

let n = 0;
const txn = (date: string, amountMinor: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  date: `${date}T12:00:00.000+05:30`,
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
const now = new Date('2026-10-25T12:00:00+05:30');
const run = (txns: Txn[]) => wrapped(txns, detectRecurring(txns), now);
const byType = (txns: Txn[]) => Object.fromEntries(run(txns).map((c) => [c.type, c]));

test('score is log10 of annual rupees times the surprise weight, halved without a working action', () => {
  expect(scoreInsight('limbo', 1_000_000)).toBeCloseTo(4 * 1.5);
  expect(scoreInsight('habit', 1_000_000)).toBeCloseTo(4 * 1.2 * 0.5);
});

test('food delivery is a habit, named by its two biggest merchants, with the real total and period', () => {
  const txns = [
    txn('2026-06-01', 50_000, { counterparty: 'SWIGGY' }),
    txn('2026-07-01', 30_000, { counterparty: 'Zomato Ltd' }),
    txn('2026-08-01', 40_000, { counterparty: 'swiggy instamart' }),
    txn('2026-09-01', 20_000, { counterparty: 'EATSURE' }),
  ];
  expect(byType(txns).habit).toMatchObject({ name: 'food delivery', merchants: ['Swiggy', 'Zomato'], totalMinor: 140_000, months: 5 });
});

test('a card under ₹1,000 a year does not qualify', () => {
  const txns = [txn('2026-10-01', 5_000, { kind: 'fee', counterparty: null })];
  expect(byType(txns).fees).toBeUndefined();
});

test('fees, active autopays and failed payments with no refund make cards', () => {
  const txns = [
    txn('2026-04-10', 59_000, { kind: 'fee', counterparty: null }),
    txn('2026-08-10', 59_000, { kind: 'fee', counterparty: null }),
    txn('2026-08-05', 64_900, { counterparty: 'NETFLIX' }),
    txn('2026-09-05', 64_900, { counterparty: 'NETFLIX' }),
    txn('2026-10-05', 64_900, { counterparty: 'NETFLIX' }),
    txn('2026-09-01', 245_000, { status: 'failed', counterparty: 'IRCTC' }),
    // Refunded, so not in limbo.
    txn('2026-09-10', 99_900, { status: 'failed', counterparty: 'MYNTRA' }),
    txn('2026-09-14', 99_900, { direction: 'credit', kind: 'refund', status: 'refund', counterparty: 'MYNTRA' }),
  ];
  const c = byType(txns);
  expect(c.fees).toMatchObject({ totalMinor: 118_000 });
  expect(c.fees!.lines[0]!.label).toBe('Bank charge');
  expect(c.autopays).toMatchObject({ count: 1, yearlyMinor: 64_900 * 12 });
  expect(c.limbo).toMatchObject({ totalMinor: 245_000 });
});

test('salary runway: the day spending passed the salary, only when it ran out well before payday', () => {
  const salary = (d: string) => txn(d, 5_000_000, { direction: 'credit', kind: 'income', instrument: 'neft', counterparty: 'ACME SALARY' });
  const txns = [salary('2026-09-01'), txn('2026-09-05', 3_000_000), txn('2026-09-21', 2_500_000), salary('2026-10-01')];
  expect(byType(txns).runway).toMatchObject({ runOutDate: txns[2]!.date, overMinor: 500_000 });
  const late = [salary('2026-09-01'), txn('2026-09-05', 3_000_000), txn('2026-09-29', 2_500_000), salary('2026-10-01')];
  expect(byType(late).runway).toBeUndefined();
});

test('spending creep compares the last three full months with the three before', () => {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const txns = months.map((m, i) => txn(`${m}-10`, i < 3 ? 2_000_000 : 2_500_000, { counterparty: i < 3 ? 'GROCER' : 'GYM' }));
  expect(byType(txns).creep).toMatchObject({ percent: 25, recentMinor: 2_500_000, earlierMinor: 2_000_000 });
  expect(byType(txns).creep!.lines[0]).toMatchObject({ label: 'GYM', amountMinor: 2_500_000 });
});

test('no cards and a summary of top payees when history is thin', () => {
  const txns = [txn('2026-10-02', 45_000, { counterparty: 'RENT CO' }), txn('2026-10-03', 12_000), txn('2026-10-04', 8_000), txn('2026-10-05', 1_000, { counterparty: 'TEA' })];
  expect(run(txns)).toEqual([]);
  expect(summary(txns, now)).toMatchObject({ totalMinor: 66_000, top: [{ label: 'RENT CO' }, { label: 'GROCER', amountMinor: 20_000 }, { label: 'TEA' }] });
  expect(run([])).toEqual([]);
  expect(summary([], now)).toEqual({ totalMinor: 0, months: 0, top: [] });
});
