import type { Instrument } from './types';

// "Rs.1,23,456.78", "INR 2000", "450.0" to integer paise, without touching floats.
export function toMinor(raw: string): number {
  // The dot in "Rs." must not be read as a decimal point.
  const clean = raw.replace(/[^\d.]/g, '').replace(/^\.+|\.$/g, '');
  const [whole = '0', frac = ''] = clean.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

// Amount with an optional currency marker: Rs, Rs., INR, ₹.
export const AMOUNT = String.raw`(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)`;

// Same, with the currency marker required. Rules without a fixed sentence shape must use this, or
// masked account digits ("XX5566 debited") are read as an amount.
export const MONEY = String.raw`(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)`;

// Masked account or card: XX1234, X1234, *1234, xx234, A/c 1234.
export const LAST4 = String.raw`[Xx*]*(\d{3,4})`;

export function headerOf(sender: string): string | null {
  const s = sender.toUpperCase().trim();
  // DLT format: AA-HEADER or AA-HEADER-S. Plain 6 letter headers also appear on some phones.
  const m = /^[A-Z]{2}-([A-Z0-9]{6})(?:-[A-Z])?$/.exec(s) ?? /^([A-Z]{6})$/.exec(s);
  return m?.[1] ?? null;
}

export function instrumentOf(body: string): Instrument {
  const b = body.toLowerCase();
  if (/\bupi\b|vpa|@[a-z]{2,}/.test(b)) return 'upi';
  if (/\bcard\b/.test(b)) return 'card';
  if (/nach|e-?mandate|autopay|\bach\b/.test(b)) return 'nach';
  if (/\batm\b|cash withdrawal/.test(b)) return 'atm';
  if (/\bimps\b/.test(b)) return 'imps';
  if (/\bneft\b|\brtgs\b/.test(b)) return 'neft';
  return 'other';
}

export function statusOf(body: string): 'success' | 'failed' | 'refund' {
  const b = body.toLowerCase();
  // A refund message usually names the failed transaction it reverses, so refund wins.
  if (/\brefund|\breversed\b|reversal/.test(b)) return 'refund';
  if (/\bfailed\b|\bdeclined\b|unsuccessful/.test(b)) return 'failed';
  return 'success';
}

export const VPA = /([a-z0-9._-]{2,}@[a-z]{2,})/i;

export function tidy(s: string | undefined): string | null {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t : null;
}
