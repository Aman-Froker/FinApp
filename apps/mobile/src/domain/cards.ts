// Credit cards, from statements (SMS or forwarded email) and card spends. Pure.
import { formatDate, formatMoney } from '@/lib/format';

import type { Statement } from './alerts';
import type { Txn } from './detect';

// A statement is paid once a card payment of at least the minimum (or the total, when no minimum
// is given) arrives after it.
export function isPaid(s: Statement, txns: Txn[]): boolean {
  return txns.some(
    (t) => t.kind === 'transfer' && t.accountLast4 === s.accountLast4 && t.date > s.receivedAt && t.amountMinor >= (s.minDueMinor ?? s.totalDueMinor),
  );
}

export type Card = {
  last4: string;
  // Newest first.
  statements: (Statement & { paid: boolean })[];
  spentSinceMinor: number;
  spends: Txn[];
};

// Every card seen in a statement or a card spend. The same statement can arrive by SMS and email;
// it is kept once (same card, same due date).
export function cardsFrom(statements: Statement[], txns: Txn[]): Card[] {
  const last4s = new Set<string>();
  for (const s of statements) if (s.accountLast4) last4s.add(s.accountLast4);
  for (const t of txns) if (t.instrument === 'card' && t.direction === 'debit' && t.accountLast4) last4s.add(t.accountLast4);

  return [...last4s].sort().map((last4) => {
    const seen = new Set<string>();
    const own = statements
      .filter((s) => s.accountLast4 === last4)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .filter((s) => !seen.has(s.dueDate) && seen.add(s.dueDate));
    const since = own[0]?.receivedAt ?? '';
    const spends = txns.filter((t) => t.instrument === 'card' && t.direction === 'debit' && t.status === 'success' && t.accountLast4 === last4 && t.date > since);
    return {
      last4,
      statements: own.map((s) => ({ ...s, paid: isPaid(s, txns) })),
      spentSinceMinor: spends.reduce((sum, t) => sum + t.amountMinor, 0),
      spends: spends.reverse(),
    };
  });
}

const due = (iso: string) => formatDate(new Date(`${iso}T00:00:00`));

export function statusOf(c: Card): string {
  const s = c.statements[0];
  if (!s) return 'No statement yet';
  const total = formatMoney({ amountMinor: s.totalDueMinor, currency: 'INR' });
  return s.paid ? `Paid. ${total} was due ${due(s.dueDate)}` : `${total} due ${due(s.dueDate)}`;
}
