// Rules learned from model answers. One answer for one message becomes a pattern for every message
// of the same shape: the message itself, with its amount and payee as gaps and the parts that
// change between messages (digits, spacing, month names) widened. No digit from the message is
// kept, so account numbers, balances and references never end up in a rule.
import { tidy, toMinor, withoutGateway } from './normalise';
import type { Instrument, ParsedTransaction } from './types';

export type LearnedRule = {
  header: string;
  pattern: string;
  // What each capture group holds, in order.
  groups: ('amount' | 'party')[];
  type: 'debit' | 'credit';
  instrument: Instrument;
  status: 'success' | 'failed' | 'refund';
};

export type Answer = Pick<ParsedTransaction, 'type' | 'amountMinor' | 'counterparty' | 'instrument' | 'status'>;

const AMOUNT = String.raw`([\d,]+(?:\.\d{1,2})?)`;
const PARTY = String.raw`(.{1,60}?)`;
const DIGITS = String.raw`\d+`;
const SPACE = String.raw`\s+`;
const WORD = '[A-Za-z]+';
const MONTH = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// A capitalised word joined by a dash or slash is a field value ("POS-ZOMATO-BANGALORE", "UPI/P2M"),
// which changes from message to message.
const fieldValue = (parts: string[], i: number) =>
  /^[A-Z]{2,}$/.test(parts[i]!) && (/[-/]$/.test(parts[i - 1] ?? '') || /^[-/]/.test(parts[i + 1] ?? ''));

const literal = (text: string) => {
  const parts = text.split(/(\d+|\s+|[A-Za-z]+)/).filter(Boolean);
  return parts
    .map((part, i) =>
      /^\d+$/.test(part) ? DIGITS : /^\s+$/.test(part) ? SPACE : MONTH.test(part) || fieldValue(parts, i) ? WORD : escape(part),
    )
    .join('');
};

const compiled = new Map<string, RegExp>();
const regexOf = (pattern: string) => {
  let re = compiled.get(pattern);
  if (!re) compiled.set(pattern, (re = new RegExp(pattern)));
  return re;
};

// The amount and payee a rule reads from a message, or null when the message is another shape.
export function readRule(rule: LearnedRule, body: string): { amountMinor: number; counterparty: string | null } | null {
  const m = regexOf(rule.pattern).exec(body);
  if (!m) return null;
  const amount = m[rule.groups.indexOf('amount') + 1];
  const party = rule.groups.includes('party') ? tidy(withoutGateway(m[rule.groups.indexOf('party') + 1] ?? '')) : null;
  const amountMinor = amount ? toMinor(amount) : 0;
  return amountMinor > 0 ? { amountMinor, counterparty: party } : null;
}

export function learnRule(header: string, body: string, answer: Answer): LearnedRule | null {
  if (body.length > 1000) return null;
  const at = [...body.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)].find((m) => toMinor(m[0]) === answer.amountMinor);
  if (!at) return null;
  const spans: { kind: 'amount' | 'party'; start: number; end: number }[] = [{ kind: 'amount', start: at.index, end: at.index + at[0].length }];
  const name = answer.counterparty?.trim();
  const i = name ? body.toLowerCase().indexOf(name.toLowerCase()) : -1;
  if (name && i >= 0 && (i >= spans[0]!.end || i + name.length <= spans[0]!.start)) spans.push({ kind: 'party', start: i, end: i + name.length });
  spans.sort((a, b) => a.start - b.start);

  let pattern = '^';
  let from = 0;
  for (const s of spans) {
    pattern += literal(body.slice(from, s.start)) + (s.kind === 'amount' ? AMOUNT : PARTY);
    from = s.end;
  }
  pattern += `${literal(body.slice(from))}$`;
  const rule: LearnedRule = { header, pattern, groups: spans.map((s) => s.kind), type: answer.type, instrument: answer.instrument, status: answer.status };

  // A rule must read its own message back to the same answer.
  const back = readRule(rule, body);
  if (!back || back.amountMinor !== answer.amountMinor) return null;
  if (rule.groups.includes('party') && back.counterparty?.toLowerCase() !== name!.toLowerCase()) return null;
  return safePattern(rule.pattern, rule.groups) ? rule : null;
}

// A shared rule comes from another phone through the server, so it is checked to be one this file
// could have made: literal text and the gap tokens only, nothing that can backtrack badly.
export function safePattern(pattern: string, groups: LearnedRule['groups']): boolean {
  if (pattern.length > 3000 || !pattern.startsWith('^') || !pattern.endsWith('$')) return false;
  if (groups.filter((g) => g === 'amount').length !== 1 || groups.filter((g) => g === 'party').length > 1) return false;
  let rest = pattern.slice(1, -1);
  for (const [token, want] of [[AMOUNT, 1], [PARTY, groups.includes('party') ? 1 : 0]] as const) {
    if (rest.split(token).length - 1 !== want) return false;
    rest = rest.split(token).join(' ');
  }
  if (groups.length === 2 && (pattern.indexOf(AMOUNT) < pattern.indexOf(PARTY)) !== (groups[0] === 'amount')) return false;
  if (/\\d\+\\d\+|\\s\+\\s\+/.test(rest)) return false;
  for (const token of [DIGITS, SPACE, WORD]) rest = rest.split(token).join(' ');
  rest = rest.replace(/\\[^\w\s]/g, '');
  return !/[\\^$.*+?()[\]{}|]/.test(rest);
}
