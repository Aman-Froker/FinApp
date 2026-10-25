import { upiNote } from '@finapp/parser';
import type { Category, MerchantLookupResponse } from '@finapp/shared';
import * as Crypto from 'expo-crypto';

import { getDb, getSetting, setSetting } from './db';
import { SmsInbox } from '../../modules/sms-inbox';
import type { Txn } from '@/domain/detect';
import { KEEP_UNMATCHED_MS, matchNotes, type Note } from '@/domain/merchants';
import { api } from '@/lib/api';
import { deviceToken } from '@/lib/device';

export type LabelSource = 'user' | 'notification' | 'shared';
export type Label = { vpa: string; merchantName: string; category: Category | null };

// A UPI ID made of a phone number names a person and is easy to reverse from its hash, so it is
// never sent to the server in any form.
const PERSONAL_VPA = /^\+?\d{10,12}@/;
const LOOKUP_EVERY_DAYS = 7;
const LOOKUP_BATCH = 50;

const hashOf = (vpa: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, vpa.toLowerCase());

// A user's own label always wins; a notification or the shared map never overwrites it.
export async function saveLabels(labels: Label[], by: LabelSource): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const l of labels) {
      await db.runAsync(
        `INSERT INTO labels (vpa, merchantName, category, labelledBy, updatedAt) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(vpa) DO UPDATE SET merchantName = excluded.merchantName, category = excluded.category,
             labelledBy = excluded.labelledBy, updatedAt = excluded.updatedAt
           WHERE labels.labelledBy != 'user' OR excluded.labelledBy = 'user'`,
        l.vpa, l.merchantName, l.category, by, now,
      );
    }
  });
  await applyLabels();
}

// Names every transaction that only had a UPI ID. Runs after each sync, since a re-parse resets them.
export async function applyLabels(): Promise<void> {
  await (await getDb()).runAsync(
    `UPDATE transactions SET counterparty = l.merchantName, category = COALESCE(transactions.category, l.category)
       FROM labels l WHERE transactions.counterpartyVpa = l.vpa AND transactions.counterparty IS NULL`,
  );
}

// Sends the user's own labels to the shared map, hashed. Payments to people are never sent.
export async function shareLabels(labels: Label[]): Promise<void> {
  const shareable = labels.filter((l) => !PERSONAL_VPA.test(l.vpa) && l.category && l.category !== 'Family and friends');
  if (!shareable.length) return;
  const body = { labels: await Promise.all(shareable.map(async (l) => ({ hash: await hashOf(l.vpa), name: l.merchantName, category: l.category }))) };
  await api('/v1/merchants/labels', { method: 'POST', token: await deviceToken(), body });
}

// Asks the shared map about unnamed UPI IDs, each at most once a week.
export async function lookupShared(): Promise<number> {
  const db = await getDb();
  const since = new Date(Date.now() - LOOKUP_EVERY_DAYS * 86_400_000).toISOString();
  const rows = await db.getAllAsync<{ vpa: string }>(
    `SELECT t.counterpartyVpa AS vpa FROM transactions t
       LEFT JOIN vpa_lookups v ON v.vpa = t.counterpartyVpa
      WHERE t.counterparty IS NULL AND t.counterpartyVpa IS NOT NULL AND (v.at IS NULL OR v.at < ?)
      GROUP BY t.counterpartyVpa ORDER BY SUM(t.amountMinor) DESC LIMIT ?`,
    since, LOOKUP_BATCH,
  );
  const vpas = rows.map((r) => r.vpa).filter((v) => !PERSONAL_VPA.test(v));
  if (!vpas.length) return 0;
  const byHash = new Map(await Promise.all(vpas.map(async (v) => [await hashOf(v), v] as const)));
  const res = await api<MerchantLookupResponse>('/v1/merchants/lookup', { method: 'POST', token: await deviceToken(), body: { hashes: [...byHash.keys()] } });
  const now = new Date().toISOString();
  for (const v of vpas) await db.runAsync('INSERT OR REPLACE INTO vpa_lookups (vpa, at) VALUES (?, ?)', v, now);
  const found = res.merchants.map((m) => ({ vpa: byHash.get(m.hash)!, merchantName: m.name, category: m.category }));
  if (found.length) await saveLabels(found, 'shared');
  return found.length;
}

// Names unnamed debits from UPI app payment notifications. A notification can arrive before its
// bank SMS, so unmatched ones wait up to an hour for the next refresh.
export async function matchUpiNotes(): Promise<number> {
  const fresh: Note[] = (SmsInbox?.drainUpiNotes() ?? []).flatMap((raw) => {
    const n = upiNote(raw.app, raw.title, raw.text);
    return n ? [{ ...n, postedAt: raw.postedAt }] : [];
  });
  const waiting = JSON.parse((await getSetting('upi.pending')) ?? '[]') as Note[];
  if (!fresh.length && !waiting.length) return 0;
  const open = await (await getDb()).getAllAsync<Txn>(
    "SELECT id, date, amountMinor, direction, kind, status, instrument, accountLast4, counterparty, counterpartyVpa FROM transactions WHERE direction = 'debit' AND counterparty IS NULL AND counterpartyVpa IS NOT NULL",
  );
  const { matched, unmatched } = matchNotes([...waiting, ...fresh], open);
  const cutoff = Date.now() - KEEP_UNMATCHED_MS;
  await setSetting('upi.pending', JSON.stringify(unmatched.filter((n) => n.postedAt > cutoff)));
  if (matched.length) await saveLabels(matched.map((m) => ({ vpa: m.vpa, merchantName: m.payee, category: null })), 'notification');
  return matched.length;
}
