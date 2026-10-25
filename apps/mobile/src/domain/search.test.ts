import type { Txn } from './detect';
import { isEmpty, matches, parseQuery } from './search';

const now = new Date('2026-10-25T12:00:00+05:30');
let n = 0;
const txn = (date: string, amountMinor: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`, date: `${date}T12:00:00.000+05:30`, amountMinor, direction: 'debit', kind: 'spend', status: 'success',
  instrument: 'upi', accountLast4: '1234', counterparty: null, counterpartyVpa: null, ...over,
});
const daya = txn('2026-10-18', 125_00, { counterparty: 'Daya shankar singh', counterpartyVpa: 'daya.s@oksbi' });
const swiggy = txn('2026-10-24', 450_50, { counterparty: 'SWIGGY' });
const rent = txn('2026-09-01', 25_000_00, { counterparty: 'Marriott Residency' });
const bare = txn('2026-10-24', 999_00, { counterpartyVpa: '9876543210@paytm' });
const all = [daya, swiggy, rent, bare];
const find = (q: string) => all.filter((t) => matches(t, parseQuery(q, now))).map((t) => t.id);

test('by person or UPI ID, every word anywhere in the name', () => {
  expect(find('daya singh')).toEqual([daya.id]);
  expect(find('oksbi')).toEqual([daya.id]);
  // Six digits or more is part of a UPI ID or phone number, not an amount.
  expect(find('987654')).toEqual([bare.id]);
});

test('by amount: rupees, exact paise, ranges and comparisons', () => {
  expect(find('450')).toEqual([swiggy.id]);
  expect(find('₹450.50')).toEqual([swiggy.id]);
  expect(find('450.49')).toEqual([]);
  expect(find('100-500')).toEqual([daya.id, swiggy.id]);
  expect(find('rs 900 to 1,000')).toEqual([bare.id]);
  expect(find('>1000')).toEqual([rent.id]);
  expect(find('under 200')).toEqual([daya.id]);
});

test('by date, and in any mix with names and amounts', () => {
  expect(find('24 Oct')).toEqual([swiggy.id, bare.id]);
  expect(find('oct 24')).toEqual([swiggy.id, bare.id]);
  expect(find('september')).toEqual([rent.id]);
  expect(find('2026-10-18')).toEqual([daya.id]);
  expect(find('24/10')).toEqual([swiggy.id, bare.id]);
  expect(find('yesterday')).toEqual([swiggy.id, bare.id]);
  expect(find('swiggy 24 oct >400')).toEqual([swiggy.id]);
  // A merchant whose name starts like a month is still a name.
  expect(find('marriott')).toEqual([rent.id]);
});

test('a /regex/ runs on the payee; an invalid one is searched as text', () => {
  expect(find('/^s.*y$/')).toEqual([swiggy.id]);
  expect(find('/@(oksbi|paytm)$/')).toEqual([daya.id, bare.id]);
  expect(find('/[unclosed/')).toEqual([]);
  expect(isEmpty(parseQuery('  ', now))).toBe(true);
});
