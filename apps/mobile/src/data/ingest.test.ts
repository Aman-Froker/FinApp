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
