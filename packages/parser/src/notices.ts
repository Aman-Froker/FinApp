import { headerOf, LAST4, MONEY, tidy, toMinor } from './normalise';
import type { ParseInput } from './types';

// Messages that move no money but drive alerts: a card statement (card due alert) and an autopay
// or e-mandate registration (new autopay alert). parse() returns null for both.
export type Notice =
  | { kind: 'statement'; accountLast4: string | null; totalDueMinor: number; minDueMinor: number | null; dueDate: string }
  | { kind: 'mandate'; payee: string | null; amountMinor: number | null };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE = String.raw`(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[- ]?[A-Za-z]{3}[a-z]*[- ,]*\d{2,4}|[A-Za-z]{3}[a-z]* \d{1,2},? \d{4})`;

// Indian bank formats are day first: 05-11-26, 05/11/2026, 05-Nov-26, 05 Nov 2026, Nov 05, 2026.
export function dateOf(raw: string): string | null {
  let d: number, m: number, y: number;
  const num = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(raw);
  const dmy = /^(\d{1,2})[- ]?([A-Za-z]{3})[a-z]*[- ,]*(\d{2,4})$/.exec(raw);
  const mdy = /^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})$/.exec(raw);
  if (num) [d, m, y] = [Number(num[1]), Number(num[2]), Number(num[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), MONTHS.indexOf(dmy[2]!.toLowerCase()) + 1, Number(dmy[3])];
  else if (mdy) [d, m, y] = [Number(mdy[2]), MONTHS.indexOf(mdy[1]!.toLowerCase()) + 1, Number(mdy[3])];
  else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const TOTAL_DUE = new RegExp(String.raw`\b(?:total (?:amount |amt\.? )?due|statement (?:balance|amount)|total outstanding)\b[^\d₹]{0,20}?` + MONEY, 'i');
const MIN_DUE = new RegExp(String.raw`\bmin(?:imum|\.)? ?(?:amount |amt\.? )?due\b[^\d₹]{0,20}?` + MONEY, 'i');
const DUE_DATE = new RegExp(String.raw`\b(?:due (?:date|by|on)|pay(?:able)? by)\b\s*(?:is|of)?\s*[:-]?\s*` + DATE, 'i');
const CARD = new RegExp(String.raw`\bcard\b[^.]{0,30}?(?:ending(?: with)?|no\.?|XX|\*\*)\s*` + LAST4, 'i');

const MANDATE = /\be-?mandate\b|\bauto-?pay\b|\bstanding instruction\b|\brecurring payment\b/i;
const SET_UP = /\b(?:registered|created|set ?up|activated|successfully added)\b/i;
const MANDATE_PAYEE = /\b(?:for|towards|to|with|of)\s+([A-Za-z][A-Za-z0-9 &.'-]{1,40}?)\s+(?:has|have|is|was|of|for|on|successfully|with|via|by|from|up ?to|max)\b/i;

export function notice(input: Pick<ParseInput, 'sender' | 'body' | 'channel'>): Notice | null {
  if (input.channel === 'sms' && !headerOf(input.sender)) return null;
  const body = input.body;

  const total = TOTAL_DUE.exec(body);
  const due = DUE_DATE.exec(body);
  const dueDate = due ? dateOf(due[1]!.trim()) : null;
  if (total && dueDate) {
    const min = MIN_DUE.exec(body);
    return {
      kind: 'statement',
      accountLast4: CARD.exec(body)?.[1] ?? null,
      totalDueMinor: toMinor(total[1]!),
      minDueMinor: min ? toMinor(min[1]!) : null,
      dueDate,
    };
  }

  if (MANDATE.test(body) && SET_UP.test(body) && !/\bdebited\b|\bfailed\b|\brevoked\b|\bcancell?ed\b/i.test(body)) {
    const amount = new RegExp(MONEY, 'i').exec(body);
    return { kind: 'mandate', payee: tidy(MANDATE_PAYEE.exec(body)?.[1]), amountMinor: amount ? toMinor(amount[1]!) : null };
  }
  return null;
}
