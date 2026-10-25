// Money is integer minor units plus an ISO 4217 code. Never a float.
export type Money = { amountMinor: number; currency: string };

export type MoneyParts = {
  sign: string; // '-' or ''
  major: string; // currency symbol and integer part, e.g. '£1,234'
  minor: string; // decimal separator and fraction, e.g. '.56', or '' for JPY
  suffix: string; // anything after the fraction, e.g. ' €' in fr-FR
};

function numberFormat(currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency });
}

function toMajorUnits(nf: Intl.NumberFormat, amountMinor: number) {
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  // shortcut: one division for display only, exact up to 2^53 minor units; arithmetic stays in minor units
  // `+ 0` turns -0 into 0, which would otherwise format as "-₹0.00".
  return amountMinor / 10 ** digits + 0;
}

const RUPEES = /^\d{1,9}(\.\d{1,2})?$/;

// What a person types as rupees ("65,000", "₹1,250.50") in paise, or null if it is not an amount.
export function parseRupees(input: string): number | null {
  const clean = input.replace(/[,\s₹]/g, '');
  if (!RUPEES.test(clean)) return null;
  const [whole = '0', frac = ''] = clean.split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return minor > 0 ? minor : null;
}

export const asRupees = (minor: number) => `${Math.floor(minor / 100)}${minor % 100 ? `.${String(minor % 100).padStart(2, '0')}` : ''}`;

export function formatMoney({ amountMinor, currency }: Money, locale = 'en-IN'): string {
  const nf = numberFormat(currency, locale);
  return nf.format(toMajorUnits(nf, amountMinor));
}

// Splits the formatted string rather than using formatToParts, which Hermes does not implement.
export function formatMoneyParts({ amountMinor, currency }: Money, locale = 'en-IN'): MoneyParts {
  const nf = numberFormat(currency, locale);
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  let s = nf.format(toMajorUnits(nf, amountMinor));
  let sign = '';
  if (/^[-−]/.test(s)) {
    sign = '-';
    s = s.slice(1);
  }
  // shortcut: assumes ASCII digits, upgrade if a locale with native digits is ever supported
  const m = digits > 0 ? new RegExp(`^(.*?)(\\D)(\\d{${digits}})(\\D*)$`).exec(s) : null;
  if (!m) return { sign, major: s, minor: '', suffix: '' };
  return { sign, major: m[1]!, minor: m[2]! + m[3]!, suffix: m[4]! };
}

export function formatDate(date: Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

// English ordinals for days of the month: 1st, 2nd, 3rd, 11th, 21st.
export const ordinal = (d: number) =>
  `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;

export const plural = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? word : `${word}s`}`;
