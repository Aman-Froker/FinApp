import { describe, expect, test } from 'vitest';

import { dateOf, isFinancial, notice } from '../src';

const sms = (sender: string, body: string) => ({ sender, body, channel: 'sms' as const });

describe('card statements', () => {
  test.each([
    [
      'VM-HDFCBK-S',
      'HDFC Bank Credit Card XX5678 statement generated. Total Amt Due: Rs 18,450.00, Min Amt Due: Rs 920.00. Due date: 05-11-26.',
      { accountLast4: '5678', totalDueMinor: 1845000, minDueMinor: 92000, dueDate: '2026-11-05' },
    ],
    [
      'AD-ICICIB-S',
      'Statement for ICICI Bank Credit Card XX1005: Total amount due INR 7,230.50, minimum amount due INR 362.00, payable by 12-Nov-2026.',
      { accountLast4: '1005', totalDueMinor: 723050, minDueMinor: 36200, dueDate: '2026-11-12' },
    ],
    [
      'VK-AXISBK-S',
      'Your Axis Bank card ending 4421 statement amount Rs.3,999 is due on 20 Nov 2026. Ignore if paid.',
      { accountLast4: '4421', totalDueMinor: 399900, minDueMinor: null, dueDate: '2026-11-20' },
    ],
  ])('%s statement', (sender, body, expected) => {
    expect(isFinancial(sms(sender, body))).toBe(false);
    expect(notice(sms(sender, body))).toEqual({ kind: 'statement', ...expected });
  });
});

describe('autopay registrations', () => {
  test('UPI autopay with a payee and a cap', () => {
    expect(notice(sms('VM-HDFCBK-S', 'UPI AutoPay for NETFLIX of up to Rs 649.00 has been successfully registered on your a/c **4321.'))).toEqual({
      kind: 'mandate',
      payee: 'NETFLIX',
      amountMinor: 64900,
    });
  });
  test('e-mandate with no amount', () => {
    expect(notice(sms('JD-SBIBNK-S', 'Your e-mandate towards HDFC MUTUAL FUND has been created successfully.'))).toEqual({
      kind: 'mandate',
      payee: 'HDFC MUTUAL FUND',
      amountMinor: null,
    });
  });
  test('a debit under an existing mandate is a transaction, not a registration', () => {
    expect(notice(sms('VM-HDFCBK-S', 'Rs 649 debited from a/c **4321 towards NETFLIX UPI AutoPay registered mandate.'))).toBeNull();
  });
  test('personal senders are ignored', () => {
    expect(notice(sms('+919812345678', 'autopay registered for rent of Rs 20,000'))).toBeNull();
  });
});

test('dates are read day first and impossible dates are rejected', () => {
  expect(dateOf('05/11/2026')).toBe('2026-11-05');
  expect(dateOf('Nov 5, 2026')).toBe('2026-11-05');
  expect(dateOf('31-02-26')).toBeNull();
});

test('a UPI mandate created at a bank is a new autopay, with its payee and amount', () => {
  // Masked from a real Axis Bank message.
  const body = 'Your UPI ASPRESENTED mandate has been successfully created towards Google Play from 12-08-26 to 12-08-31 for INR 650.00 - Axis Bank';
  expect(notice({ sender: 'AX-AXISBK-S', body, channel: 'sms' })).toEqual({ kind: 'mandate', payee: 'Google Play', amountMinor: 65000 });
});
