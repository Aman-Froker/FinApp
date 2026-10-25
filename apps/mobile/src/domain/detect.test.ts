import { detectRecurring, detectSalary, kindOf, pairSelfTransfers, proposeBudget, type Txn } from './detect';

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
  counterparty: null,
  counterpartyVpa: null,
  ...over,
});
const salary = (date: string, amount = 6_800_000) =>
  txn(date, amount, { direction: 'credit', kind: 'income', instrument: 'neft', counterparty: 'ACME SALARY' });
const now = new Date('2026-10-25T12:00:00+05:30');

test('card bill payments and refunds are not spending, fees are told apart', () => {
  expect(kindOf('debit', 'success', 'Payment of Rs 3,499.00 towards HDFC Bank Credit Card XX5678 is successful via CRED.')).toBe('transfer');
  expect(kindOf('credit', 'refund', 'Rs 499 credited as refund from AMAZON PAY')).toBe('refund');
  expect(kindOf('debit', 'success', 'Rs 590 debited towards annual fee incl GST')).toBe('fee');
  expect(kindOf('debit', 'success', 'Rs 450 debited to SWIGGY')).toBe('spend');
});

test('a same-amount debit and credit between two of my accounts within 30 minutes is a transfer', () => {
  const out = txn('2026-10-10', 2_000_000, { accountLast4: '1234' });
  const into = txn('2026-10-10', 2_000_000, { direction: 'credit', kind: 'income', accountLast4: '5566' });
  const later = { ...txn('2026-10-11', 2_000_000, { direction: 'credit', kind: 'income', accountLast4: '7788' }) };
  expect([...pairSelfTransfers([out, into, later])].sort()).toEqual([out.id, into.id].sort());
});

test('monthly salary and subscriptions are recurring, a one-off is not', () => {
  const txns = [
    salary('2026-07-01'), salary('2026-08-01'), salary('2026-09-01'), salary('2026-10-01'),
    txn('2026-08-05', 64_900, { counterparty: 'NETFLIX' }), txn('2026-09-05', 64_900, { counterparty: 'NETFLIX' }),
    txn('2026-09-20', 1_299_00, { counterparty: 'AMAZON PAY INDIA' }),
    txn('2026-10-05', 1_245_000, { counterparty: 'HDFC LTD EMI', instrument: 'nach' }),
  ];
  const r = detectRecurring(txns);
  const byLabel = Object.fromEntries(r.map((x) => [x.label, x]));
  expect(byLabel['ACME SALARY']).toMatchObject({ cadence: 'monthly', type: 'salary', amountMinor: 6_800_000 });
  expect(byLabel['NETFLIX']).toMatchObject({ cadence: 'monthly', type: 'subscription' });
  expect(byLabel['HDFC LTD EMI']).toMatchObject({ type: 'emi' });
  expect(byLabel['AMAZON PAY INDIA']).toBeUndefined();
});

test('a payee with payments of very different sizes is not recurring and does not crash', () => {
  const txns = [txn('2026-09-05', 12_000, { counterparty: 'SWIGGY' }), txn('2026-10-05', 90_000, { counterparty: 'SWIGGY' })];
  expect(detectRecurring(txns)).toEqual([]);
});

test('salary needs a recent monthly credit of at least ₹10,000', () => {
  const r = detectRecurring([salary('2026-09-01'), salary('2026-10-01')]);
  expect(detectSalary(r, now)).toMatchObject({ amountMinor: 6_800_000, payDay: 1 });
  expect(detectSalary(r, new Date('2027-01-25'))).toBeNull();
  expect(detectSalary(detectRecurring([salary('2026-09-01', 5_000_00), salary('2026-10-01', 5_000_00)]), now)).toBeNull();
});

test('budget is the salary when one exists, otherwise median spend of past full months', () => {
  const withSalary = [salary('2026-09-01'), salary('2026-10-01')];
  const proposal = proposeBudget(withSalary, detectRecurring(withSalary), now);
  expect(proposal).toMatchObject({ basis: 'salary', amountMinor: 6_800_000, resetDay: 1 });
  expect(proposal!.lines[0]!.txnIds).toHaveLength(2);

  const spendOnly = [
    txn('2026-08-03', 30_000_00), txn('2026-08-20', 10_000_00),
    txn('2026-09-04', 25_000_00),
    txn('2026-10-02', 99_000_00), // the current month is incomplete and must not count
  ];
  expect(proposeBudget(spendOnly, detectRecurring(spendOnly), now)).toMatchObject({ basis: 'spend', amountMinor: 32_500_00, resetDay: 1 });
  expect(proposeBudget([], [], now)).toBeNull();
});

test('months are the phone\'s calendar months: a payment at 00:30 IST on 1 October is October, not September in UTC', () => {
  const sept = { ...txn('2026-09-15', 10_000_00), id: 'sept' };
  // 00:30 IST on 1 Oct is 19:00 UTC on 30 Sep.
  const firstOfOct = { ...txn('2026-09-15', 99_000_00), id: 'oct', date: '2026-09-30T19:00:00.000Z' };
  const proposal = proposeBudget([sept, firstOfOct], [], new Date('2026-11-10T12:00:00+05:30'));
  expect(proposal!.lines.map((l) => [l.label, l.amountMinor])).toEqual([
    ['2026-10', 99_000_00],
    ['2026-09', 10_000_00],
  ]);
});
