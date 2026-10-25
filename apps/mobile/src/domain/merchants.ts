import type { Txn } from './detect';

export type Note = { amountMinor: number; payee: string; postedAt: number };

const WINDOW_MS = 15 * 60_000;
export const KEEP_UNMATCHED_MS = 60 * 60_000;

// Pairs each UPI app payment notification with the bank debit of the same amount, within 15
// minutes, that has only a UPI ID. Ambiguous notes (two candidate debits) are left unmatched.
export function matchNotes(notes: Note[], txns: Txn[]): { matched: { vpa: string; payee: string }[]; unmatched: Note[] } {
  const open = txns.filter((t) => t.direction === 'debit' && t.counterpartyVpa && !t.counterparty);
  const matched: { vpa: string; payee: string }[] = [];
  const unmatched: Note[] = [];
  for (const n of notes) {
    const hits = open.filter((t) => t.amountMinor === n.amountMinor && Math.abs(Date.parse(t.date) - n.postedAt) <= WINDOW_MS);
    if (hits.length === 1) matched.push({ vpa: hits[0]!.counterpartyVpa!, payee: n.payee });
    else unmatched.push(n);
  }
  return { matched, unmatched };
}
