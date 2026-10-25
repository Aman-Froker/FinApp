import { learnRule } from '@finapp/parser';

import { toRows } from './ingest';

jest.mock('../../modules/sms-inbox', () => ({ SmsInbox: null }));
jest.mock('./db', () => ({}));
jest.mock('@/lib/device', () => ({}));
jest.mock('@/lib/api', () => ({}));

const at = Date.UTC(2026, 9, 24, 14, 44);

test('keeps only financial messages and maps a parsed debit to spend in paise', () => {
  const { raws, txns } = toRows([
    { id: '1', sender: 'JD-SBIUPI-S', receivedAt: at, body: 'Dear UPI user A/C X4321 debited by 450.0 on date 24Oct26 trf to SWIGGY Refno 429812345679. If not u? call 1800111109. -SBI' },
    { id: '2', sender: '+919812345678', receivedAt: at, body: 'Bhai sent Rs 500 for the cab' },
    { id: '3', sender: 'VM-HDFCBK-S', receivedAt: at, body: '482913 is your OTP for txn of Rs.2,000.00. Do not share.' },
    { id: '4', sender: 'VM-YESBNK-S', receivedAt: at, body: 'Your account has been debited towards something we cannot read.' },
  ]);
  expect(raws.map((r) => [r.id, r.parsedStatus])).toEqual([
    ['1', 'parsed'],
    ['4', 'unparsed'],
  ]);
  expect(txns).toHaveLength(1);
  expect(txns[0]).toMatchObject({ id: 'sms:1', amountMinor: 45000, direction: 'debit', kind: 'spend', counterparty: 'SWIGGY' });
});

test('a card bill payment through CRED is a transfer, not spending', () => {
  const { txns } = toRows([
    { id: '9', sender: 'VM-CREDIN', receivedAt: at, body: 'Payment of Rs 3,499.00 towards HDFC Bank Credit Card XX5678 is successful via CRED.' },
  ]);
  expect(txns[0]).toMatchObject({ amountMinor: 349900, kind: 'transfer' });
});

test('card statements and autopay registrations are kept for alerts, without becoming transactions', () => {
  const { raws, txns } = toRows([
    { id: '7', sender: 'VM-HDFCBK-S', receivedAt: at, body: 'HDFC Bank Credit Card XX5678 statement generated. Total Amt Due: Rs 18,450.00, Min Amt Due: Rs 920.00. Due date: 05-11-26.' },
    { id: '8', sender: 'VM-HDFCBK-S', receivedAt: at, body: 'UPI AutoPay for NETFLIX of up to Rs 649.00 has been successfully registered on your a/c **4321.' },
  ]);
  expect(raws.map((r) => [r.id, r.rule])).toEqual([
    ['7', 'statement'],
    ['8', 'mandate'],
  ]);
  expect(txns).toEqual([]);
});

test('a learned rule reads a shape the built-in rules cannot, and never overrides a payee they found', () => {
  // No currency sign, so the generic extractor finds no amount.
  const unread = (amount: string, ref: string) => `A/c XX4321 debited with ${amount} for ZEPTO MARKETPLACE on 24-10. Ref ${ref}`;
  const rule = learnRule('YESBNK', unread('350.00', '629301234567'), { type: 'debit', amountMinor: 350_00, counterparty: 'ZEPTO MARKETPLACE', instrument: 'other', status: 'success' })!;
  const { raws, txns } = toRows(
    [
      { id: '5', sender: 'VM-YESBNK-S', receivedAt: at, body: unread('1,099.00', '629309999999') },
      { id: '1', sender: 'JD-SBIUPI-S', receivedAt: at, body: 'Dear UPI user A/C X4321 debited by 450.0 on date 24Oct26 trf to SWIGGY Refno 429812345679. If not u? call 1800111109. -SBI' },
    ],
    [rule],
  );
  expect(raws.map((r) => [r.id, r.parsedStatus, r.rule === 'learned'])).toEqual([
    ['5', 'parsed', true],
    ['1', 'parsed', false],
  ]);
  expect(txns.map((t) => [t.amountMinor, t.counterparty])).toEqual([
    [1_099_00, 'ZEPTO MARKETPLACE'],
    [450_00, 'SWIGGY'],
  ]);
});

test('a learned rule adds a missing payee but never turns a debit the rules read into a credit', () => {
  const body = 'Payment of INR 42292.6 has been received towards your Axis Bank Credit Card XX1234 on 01-02-26 - Axis Bank';
  const credit = learnRule('AXISBK', body, { type: 'credit', amountMinor: 42292_60, counterparty: 'Axis Bank', instrument: 'card', status: 'success' })!;
  expect(toRows([{ id: '6', sender: 'AD-AXISBK-S', receivedAt: at, body }], [credit]).txns[0]).toMatchObject({ direction: 'debit', kind: 'transfer', counterparty: null });
});
