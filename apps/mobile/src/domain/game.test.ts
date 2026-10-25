import type { Txn } from './detect';
import { accuracy, categoryOf, jarDelta, moneyIq, pickCategory, spendIn, streak, weekKey, weekStart } from './game';

let n = 0;
const txn = (date: string, amountMinor: number, counterparty: string | null, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  date: new Date(`${date}T12:00:00`).toISOString(),
  amountMinor,
  direction: 'debit',
  kind: 'spend',
  status: 'success',
  instrument: 'upi',
  accountLast4: '1234',
  counterparty,
  counterpartyVpa: null,
  ...over,
});
// A Sunday.
const now = new Date(2026, 9, 25, 19);

test('weeks run Monday to Sunday and are named by their Monday', () => {
  expect(weekStart(now)).toEqual(new Date(2026, 9, 19));
  expect(weekKey(new Date(2026, 9, 26))).toBe('2026-10-26');
});

test('a label wins over brand rules; Instamart is groceries, not food delivery', () => {
  expect(categoryOf(txn('2026-10-20', 1, 'SWIGGY'))).toBe('Food delivery');
  expect(categoryOf(txn('2026-10-20', 1, 'Swiggy Instamart'))).toBe('Groceries');
  expect(categoryOf(txn('2026-10-20', 1, 'SWIGGY', { category: 'Eating out' }))).toBe('Eating out');
  expect(categoryOf(txn('2026-10-20', 1, 'RAMESH'))).toBeNull();
});

test('the week\'s category rotates and skips categories with no recent spending', () => {
  const txns = [txn('2026-10-20', 450_00, 'ZOMATO'), txn('2026-10-21', 300_00, 'UBER')];
  const c = pickCategory(txns, now);
  expect(['Food delivery', 'Transport']).toContain(c);
  expect(pickCategory([], now)).toBeNull();
  expect(spendIn(txns, 'Food delivery', weekStart(now), new Date(2026, 9, 26)).totalMinor).toBe(450_00);
});

test('accuracy and Money IQ follow the PRD formula and levels', () => {
  expect(accuracy(1_800_00, 2_000_00)).toBe(90);
  expect(accuracy(5_000_00, 2_000_00)).toBe(0);
  expect(accuracy(0, 0)).toBe(100);
  expect(moneyIq([10, 90, 80, 70, 60])).toEqual({ score: 75, level: 3 });
  expect(moneyIq([95])).toEqual({ score: 95, level: 4 });
  expect(moneyIq([])).toBeNull();
});

test('streak counts Sundays played; one missed week a month is frozen; this week counts once played', () => {
  expect(streak(['2026-10-19', '2026-10-12', '2026-10-05'], now)).toEqual({ weeks: 3, frozen: 0 });
  // This week not played yet: last week's streak still stands.
  expect(streak(['2026-10-12', '2026-10-05'], now)).toEqual({ weeks: 2, frozen: 0 });
  // 12 Oct missed: the October freeze covers it.
  expect(streak(['2026-10-19', '2026-10-05'], now)).toEqual({ weeks: 2, frozen: 1 });
  // Two missed weeks in October: only one freeze, so the streak stops at the second.
  expect(streak(['2026-10-19', '2026-09-28'], now)).toEqual({ weeks: 1, frozen: 1 });
  expect(streak([], now)).toEqual({ weeks: 0, frozen: 0 });
});

test('the goal jar gets what this week came in under last week\'s prediction', () => {
  const txns = [txn('2026-10-20', 1_200_00, 'SWIGGY')];
  expect(jarDelta({ category: 'Food delivery', predictionMinor: 2_000_00 }, txns, now)).toBe(800_00);
  expect(jarDelta({ category: 'Food delivery', predictionMinor: 1_000_00 }, txns, now)).toBe(0);
  expect(jarDelta(null, txns, now)).toBe(0);
});
