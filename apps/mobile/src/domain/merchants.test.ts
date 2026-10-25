import type { Txn } from './detect';
import { matchNotes } from './merchants';

const at = Date.parse('2026-10-25T10:00:00Z');
const txn = (id: string, amountMinor: number, minutes: number, over: Partial<Txn> = {}): Txn => ({
  id,
  date: new Date(at + minutes * 60_000).toISOString(),
  amountMinor,
  direction: 'debit',
  kind: 'spend',
  status: 'success',
  instrument: 'upi',
  accountLast4: '1234',
  counterparty: null,
  counterpartyVpa: `${id}@ybl`,
  ...over,
});

test('a notification names the one unnamed debit of the same amount within 15 minutes', () => {
  const txns = [txn('a', 450_00, 2), txn('b', 450_00, 40), txn('c', 99_00, 1, { counterparty: 'SWIGGY' })];
  const r = matchNotes(
    [
      { amountMinor: 450_00, payee: 'Sharma General Store', postedAt: at },
      { amountMinor: 99_00, payee: 'Swiggy', postedAt: at },
    ],
    txns,
  );
  expect(r.matched).toEqual([{ vpa: 'a@ybl', payee: 'Sharma General Store' }]);
  expect(r.unmatched.map((n) => n.payee)).toEqual(['Swiggy']);
});

test('two candidate debits leave the note unmatched rather than guessing', () => {
  const r = matchNotes([{ amountMinor: 200_00, payee: 'Tea', postedAt: at }], [txn('a', 200_00, 1), txn('b', 200_00, -1)]);
  expect(r.matched).toEqual([]);
});
