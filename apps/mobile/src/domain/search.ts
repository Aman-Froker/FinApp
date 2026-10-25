// Transaction search. One box takes a name or UPI ID, an amount (500, 500-1000, >2000, under 200),
// a date (24 Oct, Oct, 24/10, 2026-10-24, today, yesterday) in any mix, or /a regex/ on the payee.
import { payeeOf, type Txn } from './detect';

export type Query = {
  words: string[];
  regex: RegExp | null;
  // Inclusive bounds in paise.
  minMinor: number | null;
  maxMinor: number | null;
  date: { year: number | null; month: number; day: number | null } | null;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Whole month names only, so "Marriott" is not March.
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const month = (name: string) => MONTHS.indexOf(name.slice(0, 3));
const NUM = String.raw`(\d[\d,]*(?:\.\d{1,2})?)`;
const CUR = String.raw`(?:₹|rs\.?|inr)?\s*`;
const paise = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100);

export function parseQuery(input: string, now: Date): Query {
  const q: Query = { words: [], regex: null, minMinor: null, maxMinor: null, date: null };
  let rest = input.trim().toLowerCase();

  const re = /^\/(.+)\/([a-z]*)$/.exec(input.trim());
  if (re) {
    try {
      q.regex = new RegExp(re[1]!, re[2]!.includes('i') ? re[2] : `${re[2]}i`);
      return q;
    } catch {
      // Not a valid pattern: search for it as text.
    }
  }

  const take = (pattern: RegExp, read: (m: RegExpExecArray) => void) => {
    const m = pattern.exec(rest);
    if (!m) return false;
    read(m);
    rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    return true;
  };
  const day = (d: Date) => ({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });

  // Dates first, so the 24 in "24 Oct" is not taken for an amount.
  take(/\btoday\b/, () => (q.date = day(now))) ||
    take(/\byesterday\b/, () => (q.date = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)))) ||
    take(/\b(\d{4})-(\d{1,2})(?:-(\d{1,2}))?\b/, (m) => (q.date = { year: +m[1]!, month: +m[2]! - 1, day: m[3] ? +m[3] : null })) ||
    take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      const y = m[3] ? +m[3] : null;
      q.date = { year: y !== null && y < 100 ? 2000 + y : y, month: +m[2]! - 1, day: +m[1]! };
    }) ||
    take(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}\b(?:\s+(\d{4}))?`), (m) => {
      q.date = { year: m[3] ? +m[3] : null, month: month(m[2]!), day: +m[1]! };
    }) ||
    take(new RegExp(String.raw`\b${MONTH}\s+(\d{1,2})\b(?:,?\s+(\d{4}))?`), (m) => {
      q.date = { year: m[3] ? +m[3] : null, month: month(m[1]!), day: +m[2]! };
    }) ||
    take(new RegExp(String.raw`\b${MONTH}\b(?:\s+(\d{4}))?`), (m) => (q.date = { year: m[2] ? +m[2] : null, month: month(m[1]!), day: null }));

  take(new RegExp(String.raw`${CUR}${NUM}\s*(?:-|to)\s*${CUR}${NUM}`), (m) => {
    q.minMinor = paise(m[1]!);
    q.maxMinor = paise(m[2]!);
  }) ||
    take(new RegExp(String.raw`(>=?|<=?|over|above|under|below)\s*${CUR}${NUM}`), (m) => {
      const n = paise(m[2]!);
      if (/^>|over|above/.test(m[1]!)) q.minMinor = m[1] === '>=' ? n : n + 1;
      else q.maxMinor = m[1] === '<=' ? n : n - 1;
    }) ||
    // A long bare number is part of a UPI ID or reference, so it is searched as text.
    take(new RegExp(String.raw`(?:^|\s)((?:₹|rs\.?|inr)\s*${NUM}|\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)(?=\s|$)`), (m) => {
      const raw = m[1]!.replace(/^(?:₹|rs\.?|inr)\s*/, '');
      const n = paise(raw);
      q.minMinor = n;
      // "500" means any amount in rupees 500, "500.50" means exactly that.
      q.maxMinor = raw.includes('.') ? n : n + 99;
    });

  q.words = rest.split(/\s+/).filter(Boolean);
  return q;
}

export const isEmpty = (q: Query) => !q.words.length && !q.regex && q.minMinor === null && q.maxMinor === null && !q.date;

export function matches(t: Txn, q: Query): boolean {
  if (q.minMinor !== null && t.amountMinor < q.minMinor) return false;
  if (q.maxMinor !== null && t.amountMinor > q.maxMinor) return false;
  if (q.date) {
    const d = new Date(t.date);
    if (d.getMonth() !== q.date.month) return false;
    if (q.date.day !== null && d.getDate() !== q.date.day) return false;
    if (q.date.year !== null && d.getFullYear() !== q.date.year) return false;
  }
  if (!q.words.length && !q.regex) return true;
  const fields = [payeeOf(t), t.counterparty, t.counterpartyVpa, t.accountLast4, t.category].filter((f): f is string => !!f);
  // Each field on its own, so ^ and $ anchor to the name or the UPI ID.
  if (q.regex) return fields.some((f) => q.regex!.test(f));
  const lower = fields.join(' ').toLowerCase();
  return q.words.every((w) => lower.includes(w));
}
