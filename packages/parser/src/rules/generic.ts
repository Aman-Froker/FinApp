import { toMinor } from '../normalise';
import type { RuleMatch } from '../types';

// Field extractors that work across banks. Bank rules in this folder only cover layouts these
// cannot read; their fields are laid over what is found here.

const MONEY_G = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
const DEBIT = /\b(?:debited|spent|sent|paid|withdrawn|purchase|payment of|txn of|a debit|debit (?:by|of))\b|\bdr\.?\s+(?:from|to)\b/i;
const CREDIT = /\b(?:credited|received|deposited)\b|\bcr\.?\s+(?:to|from)\b/i;
const BALANCE_BEFORE = /(?:(?:\b|avl|avbl|aval)bal(?:ance)?|\blimit|\blmt)\b[^\d]{0,12}$/i;
// "AvlBal" is written as one word by some banks, so the prefix and "bal" may touch.
const BALANCE = /(?:\b(?:avl|avbl|aval|avail(?:able)?)\.?\s*bal(?:ance)?|\bbal(?:ance)?)\b(?:\s+is)?[\s:-]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i;
// Masked digits only, so a phone number or reference is never taken for an account.
const ACCOUNT = /\b(?:a\/c|acct|account|ac|card)\b(?:\s*no\.?)?\s*(?:ending\s*(?:with\s*)?)?[x*]+\s?(\d{3,4})\b/i;
const REFERENCE = /(?:\bref(?:erence)?\b(?:\s*(?:no\.?|number))?(?:\s+is)?|\brefno\b|\butr\b|\bupi\b(?:\s*ref(?:\s*no)?)?)[\s:.#-]*(\d{9,})/i;
const UPI_PATH_NAME_AFTER = /UPI\/(?:P2[AM]\/)?\d{6,}\/([A-Za-z][^/\n.]*?)(?:\/|\.|\s{2,}|\n|$)/i;
const UPI_PATH_NAME_BEFORE = /UPI\/([A-Za-z][^/\n]*?)\/\d{6,}/i;
const UPI_PATH_REF = /UPI\/(?:P2[AM]\/)?(\d{9,})|UPI\/[A-Za-z][^/\n]*?\/(\d{9,})/i;
// Later words may not be another preposition or an account word, so a name never spans "from Kotak Bank AC XX1122 to".
const NAME = String.raw`[A-Za-z][\w&'-]*(?:\s+(?!(?:to|from|at|by|towards|a\/c|ac|acct|account)\b)[A-Za-z0-9][\w&'-]*){0,5}?`;
const STOP = String.raw`(?=\s+(?:on|via|is|was|has|successful|for|using|ref|refno|avl|bal|info|not|upi|from|to|at|by)\b|\s*\.|\s*[(;,]|\s*\n|$)`;
const PARTY = new RegExp(String.raw`\b(?:to|at|towards|by|from)\s+(?!(?:a\/c|your|ac|acct|account|vpa|upi|transfer|the|date|nach|ach|ecs|mandate)\b)(${NAME})${STOP}`, 'i');
// "towards NACH for NETFLIX": a mandate names its payee after the rail.
const MANDATE_PARTY = new RegExp(String.raw`\b(?:nach|ach|ecs|mandate|autopay)\s+(?:for|of|towards|to)\s+(${NAME})${STOP}`, 'i');

function directionAt(body: string): { type: 'debit' | 'credit'; index: number } | null {
  const d = DEBIT.exec(body);
  const c = CREDIT.exec(body);
  if (!d && !c) return null;
  if (d && (!c || d.index <= c.index)) return { type: 'debit', index: d.index };
  return { type: 'credit', index: c!.index };
}

// The transaction amount is the currency amount nearest the verb that is not a balance or limit.
function amountNear(body: string, at: number): number | null {
  let best: { minor: number; distance: number } | null = null;
  for (const m of body.matchAll(MONEY_G)) {
    if (BALANCE_BEFORE.test(body.slice(Math.max(0, m.index - 20), m.index))) continue;
    const distance = Math.abs(m.index - at);
    if (!best || distance < best.distance) best = { minor: toMinor(m[1]!), distance };
  }
  return best?.minor ?? null;
}

export function genericMatch(body: string): RuleMatch | null {
  const dir = directionAt(body);
  if (!dir) return null;
  const amountMinor = amountNear(body, dir.index);
  if (!amountMinor) return null;
  return { type: dir.type, amountMinor };
}

export type Fields = Pick<RuleMatch, 'accountLast4' | 'balanceAfterMinor' | 'referenceNo' | 'counterparty'>;

export function genericFields(body: string): Fields {
  const balance = BALANCE.exec(body)?.[1];
  const party =
    UPI_PATH_NAME_AFTER.exec(body)?.[1] ??
    UPI_PATH_NAME_BEFORE.exec(body)?.[1] ??
    MANDATE_PARTY.exec(body)?.[1] ??
    PARTY.exec(body)?.[1] ??
    null;
  return {
    accountLast4: ACCOUNT.exec(body)?.[1] ?? null,
    balanceAfterMinor: balance ? toMinor(balance) : null,
    referenceNo: REFERENCE.exec(body)?.[1] ?? (UPI_PATH_REF.exec(body)?.slice(1).find(Boolean) ?? null),
    // Masked account digits are never part of a name: "HDFC Bank Credit Card XX5678" becomes "HDFC Bank Credit Card".
    counterparty: party ? party.replace(/\s*[Xx*]+\d{3,4}\b/g, '').replace(/[\s.,-]+$/, '').trim() || null : null,
  };
}
