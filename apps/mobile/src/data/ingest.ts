import { amountsIn, isFinancial, maskForFallback, notice, parse, PARSER_VERSION, templateKey } from '@finapp/parser';
import type { FallbackResponse } from '@finapp/shared';

import { getDb, getSetting, setSetting } from './db';
import { applyLabels } from './labels';
import { SmsInbox, type InboxSms } from '../../modules/sms-inbox';
import type { Balance, Mandate, Statement } from '@/domain/alerts';
import { cardsFrom, type Card } from '@/domain/cards';
import { detectRecurring, kindOf, pairSelfTransfers, type Kind, type Recurring, type Txn } from '@/domain/detect';
import { api, ApiError } from '@/lib/api';
import { deviceToken } from '@/lib/device';

const HISTORY_DAYS = 365;
const PAGE = 500;

export type RawRow = {
  id: string;
  sender: string;
  body: string;
  receivedAt: string;
  parsedStatus: 'parsed' | 'unparsed';
  rule: string | null;
  templateKey: string;
};

export type TxnRow = {
  id: string;
  smsId: string;
  date: string;
  amountMinor: number;
  direction: 'debit' | 'credit';
  kind: Kind;
  status: string;
  instrument: string;
  accountLast4: string | null;
  counterparty: string | null;
  counterpartyVpa: string | null;
  balanceAfterMinor: number | null;
  referenceNo: string | null;
  rule: string;
};

// Pure: personal messages, OTPs and promotions are dropped here and never reach the database.
// Card statements and autopay registrations move no money but are kept for alerts.
export function toRows(batch: InboxSms[]): { raws: RawRow[]; txns: TxnRow[] } {
  const raws: RawRow[] = [];
  const txns: TxnRow[] = [];
  for (const sms of batch) {
    const input = { sender: sms.sender, body: sms.body, receivedAt: new Date(sms.receivedAt).toISOString(), channel: 'sms' as const };
    if (!isFinancial(input)) {
      const n = notice(input);
      if (n) raws.push({ id: sms.id, sender: sms.sender, body: sms.body, receivedAt: input.receivedAt, parsedStatus: 'parsed', rule: n.kind, templateKey: templateKey(sms.body) });
      continue;
    }
    const p = parse(input);
    raws.push({
      id: sms.id,
      sender: sms.sender,
      body: sms.body,
      receivedAt: input.receivedAt,
      parsedStatus: p ? 'parsed' : 'unparsed',
      rule: p?.rule ?? null,
      templateKey: templateKey(sms.body),
    });
    if (!p) continue;
    txns.push({
      id: `sms:${sms.id}`,
      smsId: sms.id,
      date: p.date,
      amountMinor: p.amountMinor,
      direction: p.type,
      kind: kindOf(p.type, p.status, sms.body),
      status: p.status,
      instrument: p.instrument,
      accountLast4: p.accountLast4,
      counterparty: p.counterparty,
      counterpartyVpa: p.counterpartyVpa,
      balanceAfterMinor: p.balanceAfterMinor,
      referenceNo: p.referenceNo,
      rule: p.rule,
    });
  }
  return { raws, txns };
}

export type SyncResult = { scanned: number; financial: number; parsed: number; seconds: number };
export type SyncProgress = { scanned: number; total: number };

// Reads the inbox from where the last sync stopped (or 12 months back) in pages, oldest first.
export async function syncInbox(onProgress?: (p: SyncProgress) => void): Promise<SyncResult> {
  if (!SmsInbox) throw new Error('SMS reading needs the Android development build');
  const started = Date.now();
  const db = await getDb();
  await reparseIfRulesChanged();
  let since = Number((await getSetting('sms.since')) ?? Date.now() - HISTORY_DAYS * 86_400_000);
  const result: SyncResult = { scanned: 0, financial: 0, parsed: 0, seconds: 0 };
  const total = onProgress ? await SmsInbox.countInbox(since) : 0;

  for (;;) {
    const batch = await SmsInbox.readInbox(since, PAGE);
    const { raws, txns } = toRows(batch);
    await db.withTransactionAsync(async () => {
      for (const r of raws) {
        await db.runAsync(
          'INSERT OR IGNORE INTO sms_raw (id, sender, body, receivedAt, parsedStatus, rule, templateKey) VALUES (?, ?, ?, ?, ?, ?, ?)',
          r.id, r.sender, r.body, r.receivedAt, r.parsedStatus, r.rule, r.templateKey,
        );
      }
      for (const t of txns) {
        await db.runAsync(
          `INSERT OR IGNORE INTO transactions (id, smsId, date, amountMinor, direction, kind, status, instrument, accountLast4,
             counterparty, counterpartyVpa, balanceAfterMinor, referenceNo, source, rule)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule', ?)`,
          t.id, t.smsId, t.date, t.amountMinor, t.direction, t.kind, t.status, t.instrument, t.accountLast4,
          t.counterparty, t.counterpartyVpa, t.balanceAfterMinor, t.referenceNo, t.rule,
        );
      }
    });
    result.scanned += batch.length;
    result.financial += raws.length;
    result.parsed += txns.length;
    onProgress?.({ scanned: Math.min(result.scanned, total), total });

    const last = batch.at(-1)?.receivedAt;
    if (last !== undefined) {
      // Paging is inclusive of `since`; if a full page shares one timestamp, step past it to avoid looping.
      since = last === since && batch.length === PAGE ? last + 1 : last;
      await setSetting('sms.since', String(since));
    }
    if (batch.length < PAGE) break;
  }
  await applyLabels();
  await markSelfTransfers();
  result.seconds = (Date.now() - started) / 1000;
  return result;
}

const UPSERT_TXN = `INSERT INTO transactions (id, smsId, date, amountMinor, direction, kind, status, instrument, accountLast4,
    counterparty, counterpartyVpa, balanceAfterMinor, referenceNo, source, rule)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule', ?)
  ON CONFLICT(id) DO UPDATE SET amountMinor = excluded.amountMinor, direction = excluded.direction, kind = excluded.kind,
    status = excluded.status, instrument = excluded.instrument, accountLast4 = excluded.accountLast4,
    counterparty = excluded.counterparty, counterpartyVpa = excluded.counterpartyVpa,
    balanceAfterMinor = excluded.balanceAfterMinor, referenceNo = excluded.referenceNo, source = 'rule', rule = excluded.rule
  WHERE transactions.source != 'user'`;

// After an app update with new rules, stored messages are parsed again. User edits are never
// overwritten, a model result is kept unless the rules can now read the message, and anything the
// new rules say is not a transaction is removed from the phone.
async function reparseIfRulesChanged(): Promise<void> {
  if ((await getSetting('parser.version')) === String(PARSER_VERSION)) return;
  const db = await getDb();
  const stored = await db.getAllAsync<{ id: string; sender: string; body: string; receivedAt: string; rule: string | null }>(
    'SELECT id, sender, body, receivedAt, rule FROM sms_raw',
  );
  const { raws, txns } = toRows(stored.map((r) => ({ ...r, receivedAt: Date.parse(r.receivedAt) })));
  const kept = new Map(raws.map((r) => [r.id, r]));
  await db.withTransactionAsync(async () => {
    for (const old of stored) {
      const now = kept.get(old.id);
      if (!now) {
        await db.runAsync("DELETE FROM transactions WHERE smsId = ? AND source != 'user'", old.id);
        await db.runAsync('DELETE FROM sms_raw WHERE id = ?', old.id);
      } else if (now.parsedStatus === 'parsed' || old.rule !== 'llm') {
        await db.runAsync('UPDATE sms_raw SET parsedStatus = ?, rule = ?, templateKey = ? WHERE id = ?', now.parsedStatus, now.rule, now.templateKey, old.id);
        if (now.parsedStatus === 'unparsed') await db.runAsync("DELETE FROM transactions WHERE smsId = ? AND source = 'rule'", old.id);
      }
    }
    for (const t of txns) {
      await db.runAsync(UPSERT_TXN, t.id, t.smsId, t.date, t.amountMinor, t.direction, t.kind, t.status, t.instrument, t.accountLast4,
        t.counterparty, t.counterpartyVpa, t.balanceAfterMinor, t.referenceNo, t.rule);
    }
  });
  // Read the inbox again from the start, for messages the old rules skipped (statements before M3).
  await db.runAsync("DELETE FROM settings WHERE key = 'sms.since'");
  await setSetting('parser.version', String(PARSER_VERSION));
}

export async function loadHistory(): Promise<{ txns: Txn[]; recurring: Recurring[] }> {
  const txns = await allTransactions();
  return { txns, recurring: detectRecurring(txns) };
}

const TXN_COLUMNS = 'id, date, amountMinor, direction, kind, status, instrument, accountLast4, counterparty, counterpartyVpa, refundExpected, category';

export async function allTransactions(): Promise<Txn[]> {
  return (await getDb()).getAllAsync<Txn>(`SELECT ${TXN_COLUMNS} FROM transactions ORDER BY date`);
}

// Money moved between the user's own accounts is neither spending nor income. User edits are never overwritten.
async function markSelfTransfers(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<Txn>(
    `SELECT ${TXN_COLUMNS} FROM transactions WHERE source != 'user' AND kind IN ('spend', 'income')`,
  );
  const ids = [...pairSelfTransfers(rows)];
  await db.withTransactionAsync(async () => {
    for (const id of ids) await db.runAsync("UPDATE transactions SET kind = 'transfer' WHERE id = ?", id);
  });
}

const FALLBACK_PER_SYNC = 10;

// Unparsed financial messages go to the server model, masked, one per message shape, newest
// first. The server caps calls per month; a 429 or 503 just means try again on a later sync.
export async function runFallback(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; sender: string; body: string; receivedAt: string; templateKey: string }>(
    `SELECT id, sender, body, receivedAt, templateKey FROM sms_raw
      WHERE parsedStatus = 'unparsed' AND fallbackAt IS NULL
      GROUP BY templateKey ORDER BY receivedAt DESC LIMIT ?`,
    FALLBACK_PER_SYNC,
  );
  let parsed = 0;
  for (const row of rows) {
    let res: FallbackResponse;
    try {
      res = await api<FallbackResponse>('/v1/parse/fallback', {
        method: 'POST',
        token: await deviceToken(),
        body: { sender: row.sender.slice(0, 20), text: maskForFallback(row.body), templateKey: row.templateKey },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) {
        await db.runAsync('UPDATE sms_raw SET fallbackAt = ? WHERE id = ?', new Date().toISOString(), row.id);
        continue;
      }
      break;
    }
    const t = res.transaction;
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE sms_raw SET fallbackAt = ? WHERE id = ?', new Date().toISOString(), row.id);
      // Checked again here: the amount must be written in the original message.
      if (!t || !amountsIn(row.body).has(t.amountMinor)) return;
      await db.runAsync(
        `INSERT OR IGNORE INTO transactions (id, smsId, date, amountMinor, direction, kind, status, instrument, counterparty, source, rule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'llm', 'llm')`,
        `sms:${row.id}`, row.id, row.receivedAt, t.amountMinor, t.type, kindOf(t.type, t.status, row.body), t.status, t.instrument, t.counterparty,
      );
      await db.runAsync("UPDATE sms_raw SET parsedStatus = 'parsed', rule = 'llm' WHERE id = ?", row.id);
      parsed++;
    });
  }
  return parsed;
}

export type LocalStats = { financial: number; parsed: number; byRule: number; byGeneric: number; byModel: number };

export async function localStats(): Promise<LocalStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalStats>(
    `SELECT COUNT(*) AS financial,
            COALESCE(SUM(parsedStatus = 'parsed'), 0) AS parsed,
            COALESCE(SUM(rule IS NOT NULL AND rule NOT IN ('generic', 'llm')), 0) AS byRule,
            COALESCE(SUM(rule = 'generic'), 0) AS byGeneric,
            COALESCE(SUM(rule = 'llm'), 0) AS byModel
       FROM sms_raw`,
  );
  return row ?? { financial: 0, parsed: 0, byRule: 0, byGeneric: 0, byModel: 0 };
}

export async function latestTransactions(limit = 30): Promise<TxnRow[]> {
  return (await getDb()).getAllAsync<TxnRow>('SELECT * FROM transactions ORDER BY date DESC LIMIT ?', limit);
}

// The last balance each account reported.
export async function balances(): Promise<Map<string, Balance>> {
  const rows = await (await getDb()).getAllAsync<{ accountLast4: string; balanceAfterMinor: number; date: string }>(
    `SELECT accountLast4, balanceAfterMinor, MAX(date) AS date FROM transactions
      WHERE accountLast4 IS NOT NULL AND balanceAfterMinor IS NOT NULL GROUP BY accountLast4`,
  );
  return new Map(rows.map((r) => [r.accountLast4, { balanceMinor: r.balanceAfterMinor, asOf: r.date }]));
}

export async function notices(): Promise<{ statements: Statement[]; mandates: Mandate[] }> {
  const rows = await (await getDb()).getAllAsync<{ id: string; sender: string; body: string; receivedAt: string }>(
    "SELECT id, sender, body, receivedAt FROM sms_raw WHERE rule IN ('statement', 'mandate')",
  );
  // Statements from forwarded emails sit beside the SMS ones.
  const statements: Statement[] = await (await getDb()).getAllAsync<Statement>(
    'SELECT id, accountLast4, totalDueMinor, minDueMinor, dueDate, receivedAt FROM card_statements',
  );
  const mandates: Mandate[] = [];
  for (const r of rows) {
    const n = notice({ sender: r.sender, body: r.body, channel: 'sms' });
    if (n?.kind === 'statement') statements.push({ id: r.id, receivedAt: r.receivedAt, ...n });
    if (n?.kind === 'mandate') mandates.push({ id: r.id, receivedAt: r.receivedAt, payee: n.payee, amountMinor: n.amountMinor });
  }
  return { statements, mandates };
}

export type TxnEdit = { field: 'kind'; value: Kind } | { field: 'refundExpected'; value: boolean } | { field: 'category'; value: string };

// A user edit wins over every rule from now on (source = user) and is kept in the audit trail.
export async function editTransaction(id: string, edit: TxnEdit): Promise<void> {
  const db = await getDb();
  const value = typeof edit.value === 'boolean' ? Number(edit.value) : edit.value;
  await db.withTransactionAsync(async () => {
    const before = await db.getFirstAsync<{ v: string | number }>(`SELECT ${edit.field} AS v FROM transactions WHERE id = ?`, id);
    await db.runAsync(`UPDATE transactions SET ${edit.field} = ?, source = 'user' WHERE id = ?`, value, id);
    await db.runAsync(
      'INSERT INTO txn_edits (txnId, field, fromValue, toValue, at) VALUES (?, ?, ?, ?, ?)',
      id, edit.field, String(before?.v ?? ''), String(value), new Date().toISOString(),
    );
  });
}

export type TxnDetail = TxnRow & { source: string; refundExpected: number; body: string | null; sender: string | null };

// One transaction with the message it was read from, so the user can see where every figure came from.
export async function transactionDetail(id: string): Promise<TxnDetail | null> {
  return (await getDb()).getFirstAsync<TxnDetail>(
    'SELECT t.*, s.body, s.sender FROM transactions t LEFT JOIN sms_raw s ON s.id = t.smsId WHERE t.id = ?',
    id,
  );
}

export async function loadCards(): Promise<Card[]> {
  return cardsFrom((await notices()).statements, await allTransactions());
}
