import { detectRecurring, type Txn } from './detect';
import { cycleOf, mornings, safeToSpend } from './safeToSpend';

let n = 0;
const txn = (date: string, amountMinor: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  date: new Date(`${date}T12:00:00`).toISOString(),
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
const salary = { amountMinor: 60_000_00, payDay: 1 };
const run = (txns: Txn[], now: Date, excluded?: Set<string>) => safeToSpend({ txns, recurring: detectRecurring(txns), salary, excluded }, now);

test('the cycle runs from the last pay day to the next, and a 31st pay day falls back in short months', () => {
  const c = cycleOf(new Date(2026, 9, 25), 1);
  expect([c.start, c.end]).toEqual([new Date(2026, 9, 1), new Date(2026, 10, 1)]);
  const feb = cycleOf(new Date(2026, 1, 10), 31);
  expect([feb.start, feb.end]).toEqual([new Date(2026, 0, 31), new Date(2026, 1, 28)]);
});

test('salary less unpaid regular payments and this cycle spend, shared over the days to pay day', () => {
  const now = new Date(2026, 9, 25, 10);
  const txns = [
    txn('2026-08-05', 15_000_00, { counterparty: 'HDFC LTD EMI', instrument: 'nach' }),
    txn('2026-09-05', 15_000_00, { counterparty: 'HDFC LTD EMI', instrument: 'nach' }),
    txn('2026-09-28', 20_000_00, { counterparty: 'NETFLIX' }),
    txn('2026-10-03', 10_000_00),
    txn('2026-10-20', 4_000_00, { kind: 'transfer', counterparty: 'HDFC Bank Credit Card' }),
    txn('2026-10-22', 1_000_00, { direction: 'credit', kind: 'refund', status: 'refund' }),
  ];
  const s = run(txns, now);
  // The EMI was last paid on 5 Sep, so 5 Oct is due this cycle and still unpaid.
  expect(s.committed.map((c) => c.label)).toEqual(['HDFC LTD EMI']);
  // Spent: 10,000 less the 1,000 refund; the card bill payment is a transfer and does not count.
  expect(s.spentMinor).toBe(9_000_00);
  expect(s.daysLeft).toBe(7);
  expect(s.remainingMinor).toBe(60_000_00 - 15_000_00 - 9_000_00);
  expect(s.safeTodayMinor).toBe(5_142_00);
});

test('a regular payment already made this cycle counts as spent, not committed, and can be excluded', () => {
  const now = new Date(2026, 9, 25, 10);
  const emi = (d: string) => txn(d, 15_000_00, { counterparty: 'HDFC LTD EMI', instrument: 'nach' });
  const paid = run([emi('2026-08-05'), emi('2026-09-05'), emi('2026-10-05')], now);
  expect(paid.committed).toEqual([]);
  expect(paid.spentMinor).toBe(15_000_00);
  const unpaid = [emi('2026-08-05'), emi('2026-09-05')];
  expect(run(unpaid, now, new Set(['debit:hdfcltdemi'])).committed).toEqual([]);
});

test('overspending shows zero, never a negative number', () => {
  const s = run([txn('2026-10-03', 70_000_00)], new Date(2026, 9, 25, 10));
  expect(s.remainingMinor).toBe(-10_000_00);
  expect(s.safeTodayMinor).toBe(0);
});

test('pace compares with the median spend by the same day of earlier cycles', () => {
  const now = new Date(2026, 9, 10, 20);
  // History starts in July, so the August and September cycles are both complete.
  const txns = [txn('2026-07-28', 1_000_00), txn('2026-08-05', 5_000_00), txn('2026-09-05', 7_000_00), txn('2026-09-20', 50_000_00), txn('2026-10-04', 9_000_00)];
  expect(run(txns, now).pace).toEqual({ usualMinor: 6_000_00, diffMinor: -3_000_00, over: true });
  expect(run([txn('2026-10-04', 9_000_00)], now).pace).toBeNull();
});

test('each coming morning shares what is left over the days remaining, stopping before pay day', () => {
  const now = new Date(2026, 9, 28, 21);
  const s = run([txn('2026-10-03', 40_000_00)], now);
  expect(mornings(s, now, 7).map((m) => [m.date.getDate(), m.safeMinor])).toEqual([
    [29, 6_666_00],
    [30, 10_000_00],
    [31, 20_000_00],
  ]);
});

test('the goal set-aside comes off before anything is spendable', () => {
  const now = new Date(2026, 9, 25, 10);
  const txns = [txn('2026-10-03', 10_000_00)];
  const s = safeToSpend({ txns, recurring: [], salary, goalMinor: 8_000_00 }, now);
  expect(s.remainingMinor).toBe(60_000_00 - 8_000_00 - 10_000_00);
  expect(s.goalMinor).toBe(8_000_00);
});
