import { describe, expect, test } from 'vitest';

import { learnRule, parse, parseLearned, safePattern } from '../src';

const sms = (body: string, sender = 'VM-KOTAKB-S') => ({ sender, body, receivedAt: '2026-10-20T06:30:00.000Z', channel: 'sms' as const });

// Written in a Kotak-like shape the built-in rules do not read for the payee.
const first = 'Sent Rs.199.00 from Kotak Bank AC X1234 to spotify.in@hdfcbank on 18-10-26.UPI Ref 629301234567. Not you, https://kotak.com/KBANKT/Fraud';
const second = 'Sent Rs.1,250.50 from Kotak Bank AC X1234 to blinkit@icici on 19-11-26.UPI Ref 629309876543. Not you, https://kotak.com/KBANKT/Fraud';

describe('rules learned from one model answer', () => {
  test('read every message of the same shape, with a new amount and payee', () => {
    const rule = learnRule('KOTAKB', first, { type: 'debit', amountMinor: 199_00, counterparty: 'spotify.in@hdfcbank', instrument: 'upi', status: 'success' });
    expect(rule).not.toBeNull();
    // No digit of the message is kept in the rule.
    expect(rule!.pattern.replace('([\\d,]+(?:\\.\\d{1,2})?)', '').replace('(.{1,60}?)', '')).not.toMatch(/\d/);
    const p = parseLearned(sms(second), [rule!]);
    expect(p).toMatchObject({ type: 'debit', amountMinor: 1_250_50, counterpartyVpa: 'blinkit@icici', accountLast4: '1234', rule: 'learned' });
    // A VPA as the payee is shown as the VPA, as with built-in rules.
    expect(p!.counterparty).toBeNull();
  });

  test('a named payee becomes a gap, and month names and spacing may change', () => {
    const a = 'Dear Customer, Rs 4,000.00 credited to your a/c XX1234 on 12 Oct 2026 by RAHUL K (IMPS Ref 629301234567)';
    const b = 'Dear Customer, Rs 85,000.00 credited to your a/c XX1234 on 30  Sept 2026 by ACME TECH PVT LTD (IMPS Ref 629301239999)';
    const rule = learnRule('ICICIB', a, { type: 'credit', amountMinor: 4_000_00, counterparty: 'RAHUL K', instrument: 'imps', status: 'success' });
    expect(parseLearned(sms(b, 'VM-ICICIB-S'), [rule!])).toMatchObject({ type: 'credit', amountMinor: 85_000_00, counterparty: 'ACME TECH PVT LTD' });
    // Another bank's messages are never read by it.
    expect(parseLearned(sms(b, 'VM-HDFCBK-S'), [rule!])).toBeNull();
  });

  test('an answer whose amount is not in the message teaches nothing', () => {
    expect(learnRule('KOTAKB', first, { type: 'debit', amountMinor: 999_00, counterparty: null, instrument: 'upi', status: 'success' })).toBeNull();
  });

  test('only patterns this file could have made pass the check', () => {
    const rule = learnRule('KOTAKB', first, { type: 'debit', amountMinor: 199_00, counterparty: null, instrument: 'upi', status: 'success' })!;
    expect(safePattern(rule.pattern, rule.groups)).toBe(true);
    expect(safePattern('^(a+)+$', ['amount'])).toBe(false);
    expect(safePattern('^.*$', ['amount'])).toBe(false);
    expect(safePattern(rule.pattern.replace('^', '^\\d+\\d+'), rule.groups)).toBe(false);
    expect(safePattern(rule.pattern, ['amount', 'party'])).toBe(false);
  });

  test('promotions and OTPs are never read, whatever the rules', () => {
    const rule = learnRule('KOTAKB', first, { type: 'debit', amountMinor: 199_00, counterparty: null, instrument: 'upi', status: 'success' })!;
    expect(parseLearned(sms('Your OTP is 123456 for Rs 500'), [rule])).toBeNull();
    expect(parse(sms(second))).not.toBeNull();
  });
});

test('field values joined by dashes or slashes may change, so a merchant in another city is read', () => {
  const a = 'INR 2,340.50 debited from A/c XX1234 on 20-Oct-26. Info: POS-ZOMATO LIMITED-BANGALORE. Avl Bal INR 12,345.00';
  const b = 'INR 899.00 debited from A/c XX1234 on 21-Nov-26. Info: POS-DECATHLON SPORTS-PUNE. Avl Bal INR 11,446.00';
  const rule = learnRule('NEWBNK', a, { type: 'debit', amountMinor: 2_340_50, counterparty: 'ZOMATO LIMITED', instrument: 'other', status: 'success' })!;
  expect(parseLearned(sms(b, 'VM-NEWBNK-S'), [rule])).toMatchObject({ amountMinor: 899_00, counterparty: 'DECATHLON SPORTS' });
});
