import { detectRecurring, detectSalary, kindOf, ownKeys, pairSelfTransfers, proposeBudget, salaryChoices, type Txn } from './detect';

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
  // Masked from real Axis Bank messages: spending on the card, and paying its bill.
  expect(kindOf('debit', 'success', 'Spent INR 1047 \nusing Axis Bank Credit Card no. XX1234 on 24-10-26 21:10:28 IST at \nSWIGGY PVT. \nAvl limit: INR 54321.49.')).toBe('spend');
  expect(kindOf('debit', 'success', 'Payment of INR 42292.6 has been received towards your Axis Bank Credit Card XX1234 on 01-02-26 - Axis Bank')).toBe('transfer');
  expect(kindOf('credit', 'success', 'Update from CRED:  Rs.100 cashback received on your recent transaction.')).toBe('income');
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
  const txns = [salary('2026-09-01'), salary('2026-10-01')];
  const r = detectRecurring(txns);
  expect(detectSalary(txns, r, now)).toMatchObject({ amountMinor: 6_800_000, payDay: 1, sure: true });
  expect(detectSalary(txns, r, new Date('2027-01-25'))).toBeNull();
  const small = [salary('2026-09-01', 5_000_00), salary('2026-10-01', 5_000_00)];
  expect(detectSalary(small, detectRecurring(small), now)).toBeNull();
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

test('a fee is a named bank or card charge, never a passing mention of charges', () => {
  // Masked from a real Razorpay message: a ₹19,000 payment, not a fee.
  const razorpay = 'Final payment of Rs.19000 towards subscription for ACME HEALTH TRAINING PRI successfully made on 10 June 2026. No further charges will be made on your subscription - Razorpay';
  expect(kindOf('debit', 'success', razorpay)).toBe('spend');
  expect(kindOf('debit', 'success', 'Rs 1,499 paid to Myntra. Zero convenience fee on this order.')).toBe('spend');
  expect(kindOf('debit', 'success', 'Rs 1,250 debited to BigBasket. GST invoice sent to your email.')).toBe('spend');
  expect(kindOf('debit', 'success', 'Rs 15.00 debited from a/c XX4321 towards SMS alert charges for the quarter')).toBe('fee');
  expect(kindOf('debit', 'success', 'Rs 354.00 debited from a/c XX4321 for non-maintenance charges of minimum balance')).toBe('fee');
  expect(kindOf('debit', 'success', 'Late payment charges of Rs 1,180 debited on your card XX5678')).toBe('fee');
  expect(kindOf('debit', 'success', 'Rs 36.00 debited towards GST on SMS charges')).toBe('fee');
});

test('a salary credited with no payer name is still found, grouped by account and rail', () => {
  const unnamed = (date: string, amount: number) =>
    txn(date, amount, { direction: 'credit', kind: 'income', instrument: 'neft', counterparty: null, counterpartyVpa: null, accountLast4: '1234' });
  // Three monthly salaries (one with a small raise) and an unrelated one-off credit to the same account.
  const txns = [unnamed('2026-07-31', 8_500_000), unnamed('2026-08-31', 8_500_000), unnamed('2026-09-30', 8_750_000), unnamed('2026-09-12', 30_000_00)];
  const r = detectRecurring(txns);
  const salary = detectSalary(txns, r, new Date('2026-10-25T12:00:00+05:30'));
  expect(salary).toMatchObject({ amountMinor: 8_500_000, payDay: 30 });
  expect(salary!.label).toBe('NEFT credit to account ending 1234');
  expect(salary!.txnIds).toHaveLength(3);
});

test('a one-off credit after the salaries does not hide them', () => {
  const unnamed = (date: string, amount: number) =>
    txn(date, amount, { direction: 'credit', kind: 'income', instrument: 'neft', counterparty: null, counterpartyVpa: null, accountLast4: '1234' });
  const txns = [unnamed('2026-08-31', 8_500_000), unnamed('2026-09-30', 8_500_000), unnamed('2026-10-12', 30_000_00)];
  expect(detectSalary(txns, detectRecurring(txns), new Date('2026-10-25T12:00:00+05:30'))).toMatchObject({ amountMinor: 8_500_000 });
});

const credit = (date: string, amount: number, over: Partial<Txn> = {}) =>
  txn(date, amount, { direction: 'credit', kind: 'income', instrument: 'imps', counterparty: null, counterpartyVpa: null, ...over });

test('the largest credit each month is the salary when it is steady, whoever sent it', () => {
  // Payer names differ month to month and the rail changes, so no recurring group forms.
  const txns = [
    credit('2026-07-30', 9_200_000, { counterparty: 'NEFT CR KINETIC' }), credit('2026-07-12', 15_000_00),
    credit('2026-08-29', 9_200_000, { instrument: 'neft' }), credit('2026-08-15', 40_000_00, { counterparty: 'RAHUL' }),
    credit('2026-09-30', 9_400_000, { counterparty: 'ACME TECH PVT' }),
  ];
  expect(detectSalary(txns, detectRecurring(txns), now)).toMatchObject({ amountMinor: 9_200_000, payDay: 30, sure: true, label: 'Largest credit each month' });
});

test('when the big credits disagree, the salary is not sure and the user picks from the candidates', () => {
  const txns = [
    credit('2026-08-01', 50_000_00, { counterparty: 'PAPA' }), credit('2026-09-01', 50_000_00, { counterparty: 'PAPA' }), credit('2026-10-01', 50_000_00, { counterparty: 'PAPA' }),
    credit('2026-09-07', 1_20_000_00, { counterparty: 'ACME TECH' }), credit('2026-10-20', 95_000_00, { counterparty: 'FREELANCE CLIENT' }),
  ];
  const r = detectRecurring(txns);
  expect(detectSalary(txns, r, now)).toMatchObject({ label: 'PAPA', sure: false });
  // ACME TECH on 7 Sep is more than 45 days back, so it is not offered.
  expect(salaryChoices(txns, r, now).map((c) => c.label)).toEqual(['FREELANCE CLIENT', 'PAPA']);
  // A picked one-off credit becomes the budget, and the monthly credit from PAPA is added to it.
  const picked = salaryChoices(txns, r, now)[0]!;
  expect(proposeBudget(txns, r, now, picked)).toMatchObject({ basis: 'salary', amountMinor: 1_45_000_00, resetDay: 20 });
  // None of these: the budget falls back to spending, and here there is none.
  expect(proposeBudget(txns, r, now, null)).toBeNull();
});

test('only a mandate or a subscription service is an autopay, a person paid by hand each month is not', () => {
  const txns = [
    txn('2026-08-18', 125_00, { counterparty: 'Daya shankar singh' }), txn('2026-09-18', 125_00, { counterparty: 'Daya shankar singh' }),
    txn('2026-09-20', 199_00, { counterparty: 'Mobile recharge', instrument: 'nach' }), txn('2026-10-20', 199_00, { counterparty: 'Mobile recharge', instrument: 'nach' }),
    txn('2026-09-05', 649_00, { counterparty: 'NETFLIX' }), txn('2026-10-05', 649_00, { counterparty: 'NETFLIX' }),
  ];
  const byLabel = Object.fromEntries(detectRecurring(txns).map((r) => [r.label, r]));
  expect(byLabel['Daya shankar singh']).toMatchObject({ type: 'repeat', automatic: false });
  expect(byLabel['Mobile recharge']).toMatchObject({ type: 'autopay', automatic: true });
  expect(byLabel['NETFLIX']).toMatchObject({ type: 'subscription', automatic: true });
});

test('money to self is a transfer by its wording, and by the user\'s own name once a pair shows it', () => {
  expect(kindOf('debit', 'success', 'Rs 5,000 debited from A/c XX1234 via IMPS to self A/c XX5566')).toBe('transfer');
  expect(kindOf('debit', 'success', 'Rs 5,000 sent to own account XX5566')).toBe('transfer');
  expect(kindOf('debit', 'success', 'Rs 450 paid to SELFIE STUDIO')).toBe('spend');

  // A NEFT credit lands 90 minutes after the debit, both sides naming the user.
  const out = { ...txn('2026-10-10', 20_000_00, { counterparty: 'AMAN KUMAR', accountLast4: '1234' }), date: '2026-10-10T10:00:00+05:30' };
  const into = { ...txn('2026-10-10', 20_000_00, { direction: 'credit', kind: 'income', counterparty: 'Mr AMAN KUMAR', accountLast4: '5566' }), date: '2026-10-10T11:30:00+05:30' };
  // Later, only the debit arrives (the other bank sends no SMS), and a same-amount payment to a shop.
  const later = txn('2026-10-20', 3_000_00, { counterparty: 'AMAN KUMAR', accountLast4: '1234' });
  const shop = txn('2026-10-21', 3_000_00, { counterparty: 'DMART' });
  expect([...pairSelfTransfers([out, into, later, shop])].sort()).toEqual([out.id, into.id, later.id].sort());

  // Two people who share only a surname are not the user, even when the amounts pair up.
  const ravi = { ...out, id: 'ravi', counterparty: 'RAVI KUMAR' };
  const amit = { ...into, id: 'amit', counterparty: 'AMIT KUMAR' };
  const raviAgain = { ...later, id: 'ravi2', counterparty: 'RAVI KUMAR' };
  expect([...pairSelfTransfers([ravi, amit, raviAgain])].sort()).toEqual(['amit', 'ravi']);

  // The user said a payment to that name was spending, so it is not learned as theirs.
  const said = { ...later, id: 'said', source: 'user' };
  expect(pairSelfTransfers([out, into, said, { ...later, id: 'next' }]).has('next')).toBe(false);

  // A payee the user marked as a transfer is theirs from then on.
  const marked = txn('2026-10-01', 1_000_00, { counterpartyVpa: 'aman@okicici', kind: 'transfer', source: 'user' });
  const again = txn('2026-10-15', 2_000_00, { counterpartyVpa: 'aman@okicici' });
  expect(pairSelfTransfers([marked, again], ownKeys([marked, again])).has(again.id)).toBe(true);
});
