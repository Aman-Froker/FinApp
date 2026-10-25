import type { InboundItemsResponse } from '@finapp/shared';

import { getDb, setSetting } from './db';
import { kindOf } from '@/domain/detect';
import { api } from '@/lib/api';
import { deviceToken } from '@/lib/device';

// Collects what forwarded bank emails produced on the server, stores it like an SMS result, then
// acknowledges it so the server deletes it. Returns how many items were stored.
export async function pullEmail(): Promise<number> {
  const token = await deviceToken();
  const { items } = await api<InboundItemsResponse>('/v1/inbound/items', { token });
  if (!items.length) return 0;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const { id, receivedAt, payload: p } of items) {
      if (p.kind === 'gmail_confirmation') await setSetting('email.confirmationCode', p.code);
      if (p.kind === 'statement') {
        await db.runAsync(
          'INSERT OR IGNORE INTO card_statements (id, accountLast4, totalDueMinor, minDueMinor, dueDate, receivedAt) VALUES (?, ?, ?, ?, ?, ?)',
          `email:${id}`, p.accountLast4, p.totalDueMinor, p.minDueMinor, p.dueDate, receivedAt,
        );
      }
      if (p.kind === 'transaction') {
        await db.runAsync(
          `INSERT OR IGNORE INTO transactions (id, smsId, date, amountMinor, direction, kind, status, instrument, accountLast4,
             counterparty, counterpartyVpa, balanceAfterMinor, referenceNo, source, rule)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule', 'email')`,
          `email:${id}`, receivedAt, p.amountMinor, p.type, kindOf(p.type, p.status, p.summary), p.status, p.instrument, p.accountLast4,
          p.counterparty, p.counterpartyVpa, p.balanceAfterMinor, p.referenceNo,
        );
      }
    }
    await dropEmailTwins();
  });
  await api('/v1/inbound/items/ack', { method: 'POST', token, body: { ids: items.map((i) => i.id) } });
  return items.length;
}

// The same payment often arrives by SMS and by email. The SMS copy is kept: same amount and
// direction within a day and a half, and the same reference or the same account.
export async function dropEmailTwins(): Promise<void> {
  await (await getDb()).runAsync(
    `DELETE FROM transactions WHERE rule = 'email' AND source != 'user' AND EXISTS (
       SELECT 1 FROM transactions s WHERE s.rule != 'email' AND s.amountMinor = transactions.amountMinor
         AND s.direction = transactions.direction AND ABS(julianday(s.date) - julianday(transactions.date)) <= 1.5
         AND ((s.referenceNo IS NOT NULL AND s.referenceNo = transactions.referenceNo) OR s.accountLast4 = transactions.accountLast4))`,
  );
}

export async function forwardingAddress(): Promise<string> {
  return (await api<{ address: string }>('/v1/inbound/address', { token: await deviceToken() })).address;
}
