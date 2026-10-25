import { headerOf, instrumentOf, statusOf, tidy, toMinor, VPA } from './normalise';
import { axis } from './rules/axis';
import { genericFields, genericMatch } from './rules/generic';
import { hdfc } from './rules/hdfc';
import { icici } from './rules/icici';
import { sbi } from './rules/sbi';
import { readRule, type LearnedRule } from './learned';
import type { ParseInput, ParsedTransaction, RuleMatch, SenderRules } from './types';

export type * from './types';

// Bump whenever a rule or extractor changes, or kindOf in the app, so phones re-read the messages
// they already stored.
export const PARSER_VERSION = 9;
export { headerOf, toMinor } from './normalise';
export { dateOf, notice, type Notice } from './notices';
export { UPI_APPS, upiNote, type UpiNote } from './upiNotes';
export { learnRule, readRule, safePattern, type Answer, type LearnedRule } from './learned';

const PACKS: SenderRules[] = [hdfc, sbi, icici, axis];
const BY_HEADER = new Map(PACKS.flatMap((p) => p.headers.map((h) => [h, p.rules] as const)));

// Whole words, so "prepaid" and "postpaid" in telecom adverts are not "paid".
const MONEY_WORDS = /\b(?:debited|credited|spent|sent|received|withdrawn|paid|deposited)\b|payment of|\ba debit\b|\bdr\.\s|\bcr\.\s/i;
const NOT_A_TRANSACTION =
  /\bOTP\b|one time password|verification code|secret code|will be (?:auto[- ]?)?debited|was not completed|\bif debited\b|\boverdue\b|\bmin(?:imum)?\.? due\b|\bis pending\b|make (?:min(?:imum)? )?payment|available for withdrawal|\bspam\b|credited to your [\w ]{0,30}\b(?:number|wallet)\b|is due|due on|due date|minimum amount due|pre-?approved|eligible|apply now|use code|\d+% off|lifetime free|e-?mandate.*(?:registered|created)/i;

// Only business senders carrying money words reach the parser; personal SMS (phone numbers),
// OTPs and promotions are dropped on the phone and never stored.
export function isFinancial(input: Pick<ParseInput, 'sender' | 'body' | 'channel'>): boolean {
  if (input.channel === 'sms' && !headerOf(input.sender)) return false;
  // DLT marks promotional senders with -P; they never carry a transaction.
  if (input.channel === 'sms' && /-P$/i.test(input.sender.trim())) return false;
  return MONEY_WORDS.test(input.body) && !NOT_A_TRANSACTION.test(input.body);
}

export function parse(input: ParseInput): ParsedTransaction | null {
  if (!isFinancial(input)) return null;
  const body = input.body;
  const header = headerOf(input.sender);
  let rule = 'generic';
  let match: RuleMatch | null = null;
  for (const r of (header && BY_HEADER.get(header)) || []) {
    const m = r.pattern.exec(body);
    if (m) {
      rule = r.name;
      match = r.map(m);
      break;
    }
  }
  match ??= genericMatch(body);
  if (!match || match.amountMinor <= 0) return null;

  const fields = genericFields(body);
  const vpa = VPA.exec(body)?.[1]?.toLowerCase() ?? null;
  const parsed: ParsedTransaction = {
    instrument: instrumentOf(body),
    status: statusOf(body),
    counterpartyVpa: vpa,
    ...fields,
    // A rule's own fields win over the generic guesses, but a null from a rule never erases a found value.
    ...Object.fromEntries(Object.entries(match).filter(([, v]) => v !== null && v !== undefined)),
    type: match.type,
    amountMinor: match.amountMinor,
    accountLast4: match.accountLast4 ?? fields.accountLast4 ?? null,
    counterparty: tidy(match.counterparty ?? fields.counterparty ?? undefined),
    balanceAfterMinor: match.balanceAfterMinor ?? fields.balanceAfterMinor ?? null,
    referenceNo: match.referenceNo ?? fields.referenceNo ?? null,
    date: input.receivedAt,
    rule,
  };
  // A VPA as the only counterparty is shown as the VPA itself.
  if (parsed.counterparty && /^[\w.-]+@[a-z]+$/i.test(parsed.counterparty)) parsed.counterparty = null;
  return parsed;
}

// A message read by a rule learned on this phone or shared by others. The amount and payee come
// from the rule; account, balance and reference from the generic extractors.
export function parseLearned(input: ParseInput, rules: LearnedRule[]): ParsedTransaction | null {
  if (!rules.length || !isFinancial(input)) return null;
  const header = headerOf(input.sender);
  for (const r of rules) {
    if (r.header !== header) continue;
    const m = readRule(r, input.body);
    if (!m) continue;
    const fields = genericFields(input.body);
    return {
      accountLast4: fields.accountLast4 ?? null,
      balanceAfterMinor: fields.balanceAfterMinor ?? null,
      referenceNo: fields.referenceNo ?? null,
      type: r.type,
      amountMinor: m.amountMinor,
      instrument: r.instrument,
      status: r.status,
      counterparty: m.counterparty?.includes('@') ? null : m.counterparty,
      counterpartyVpa: VPA.exec(input.body)?.[1]?.toLowerCase() ?? null,
      date: input.receivedAt,
      rule: 'learned',
    };
  }
  return null;
}

// Before an unparsed message goes to the server fallback: account numbers, balances, reference
// numbers and phone numbers are masked. The amount stays so the model can extract it.
export function maskForFallback(body: string): string {
  return body
    .replace(/(?:Avl\.? Bal|Avbl\.? Bal|Available Bal(?:ance)?|\bBal)[:\s-]*(?:is\s*)?(?:Rs\.?|INR|₹)?\s*[\d,]+(?:\.\d+)?/gi, 'Bal [masked]')
    // Some banks show more than four digits ("XX123456"); none of them leave the phone.
    .replace(/[Xx*]+\s?\d{3,}\b/g, 'XXXX')
    .replace(/\b\d{6,}\b/g, '[n]');
}

// Messages with the same shape share a template, so the fallback model sees each shape once.
export function templateKey(body: string): string {
  return maskForFallback(body).replace(/\d/g, '0').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Every amount written in the text, in paise. A model's answer is accepted only if its amount is in
// this set, on the server and again on the phone, so no figure is ever invented.
export function amountsIn(text: string): Set<number> {
  return new Set([...text.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)].map((m) => toMinor(m[0])));
}

export { tidy };
