import { amountsIn, headerOf, learnRule, maskForFallback, safePattern, type LearnedRule } from '@finapp/parser';
import type { FallbackResponse, FallbackTransaction, LearnedRulesResponse } from '@finapp/shared';

import { getDb, getSetting, setSetting } from './db';
import { learnedRules, markSelfTransfers, read, UPSERT_TXN } from './ingest';
import { kindOf } from '@/domain/detect';
import { api, ApiError } from '@/lib/api';
import { deviceToken } from '@/lib/device';

// Each message shape the rules cannot read in full goes to the server model once, masked: those not
// read at all, and those read without a payee. Every answer becomes a rule for the whole shape on
// this phone, and is offered to the server, which shares a rule once two phones agree on it.
const PER_SYNC = 40;
const AT_ONCE = 4;
const PULL_EVERY = 86_400_000;

type Row = { id: string; sender: string; body: string; receivedAt: string; templateKey: string; parsedStatus: string };

const NEEDS_MODEL = `FROM sms_raw s LEFT JOIN transactions t ON t.smsId = s.id
  WHERE (s.parsedStatus = 'unparsed'
     OR (t.source = 'rule' AND t.counterparty IS NULL AND t.counterpartyVpa IS NULL AND t.instrument != 'atm'))`;

// Only a message with a rupee amount can become a transaction here. Foreign currency spends stay
// unread rather than be counted as rupees, and anything else is not worth a call.
const worthAsking = (r: Row) => /(?:Rs\.?|INR|₹)\s*\d/i.test(r.body) && !/\b(?:USD|EUR|GBP|AED|SGD)\s*\d/i.test(r.body);

// A name the model gave is kept only if it is written in the message, like the amount.
const named = (name: string | null, body: string) => (name && body.toLowerCase().includes(name.toLowerCase()) ? name : null);

async function ask(row: Row): Promise<FallbackTransaction | null | 'later'> {
  try {
    const res = await api<FallbackResponse>('/v1/parse/fallback', {
      method: 'POST',
      token: await deviceToken(),
      body: { sender: row.sender.slice(0, 20), text: maskForFallback(row.body), templateKey: row.templateKey },
    });
    return res.transaction;
  } catch (e) {
    // A 429 (monthly cap), a 5xx or no network: try again on a later sync.
    return e instanceof ApiError && e.status < 500 && e.status !== 429 ? null : 'later';
  }
}

export async function runFallback(limit = PER_SYNC): Promise<number> {
  const db = await getDb();
  await pullShared().catch(() => 0);
  let changed = await applyRules();
  for (let asked = 0; asked < limit; ) {
    const rows = (
      await db.getAllAsync<Row>(
        `SELECT s.id, s.sender, s.body, s.receivedAt, s.templateKey, s.parsedStatus ${NEEDS_MODEL}
           AND s.fallbackAt IS NULL GROUP BY s.templateKey ORDER BY s.receivedAt DESC`,
      )
    )
      .filter(worthAsking)
      .slice(0, Math.min(AT_ONCE, limit - asked));
    if (!rows.length) break;
    asked += rows.length;
    const answers = await Promise.all(rows.map(ask));
    if (answers.includes('later')) break;
    await db.withTransactionAsync(async () => {
      for (const [i, row] of rows.entries()) {
        const t = answers[i] as FallbackTransaction | null;
        await db.runAsync('UPDATE sms_raw SET fallbackAt = ? WHERE templateKey = ?', new Date().toISOString(), row.templateKey);
        // Checked again here: the amount must be written in the original message.
        if (!t || !amountsIn(row.body).has(t.amountMinor)) continue;
        const counterparty = named(t.counterparty, row.body);
        if (row.parsedStatus === 'unparsed') {
          await db.runAsync(
            `INSERT OR IGNORE INTO transactions (id, smsId, date, amountMinor, direction, kind, status, instrument, counterparty, source, rule)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'llm', 'llm')`,
            `sms:${row.id}`, row.id, row.receivedAt, t.amountMinor, t.type, kindOf(t.type, t.status, row.body), t.status, t.instrument, counterparty,
          );
          await db.runAsync("UPDATE sms_raw SET parsedStatus = 'parsed', rule = 'llm' WHERE id = ?", row.id);
          changed++;
        } else if (counterparty) {
          await db.runAsync("UPDATE transactions SET counterparty = ? WHERE smsId = ? AND source = 'rule'", counterparty, row.id);
          changed++;
        }
        const header = headerOf(row.sender);
        const rule = header ? learnRule(header, row.body, { ...t, counterparty }) : null;
        if (rule) await saveRule(rule, 'device');
      }
    });
    changed += await applyRules();
  }
  await pushRules().catch(() => 0);
  if (changed) await markSelfTransfers();
  return changed;
}

const saveRule = async (r: LearnedRule, origin: 'device' | 'shared') =>
  (await getDb()).runAsync(
    'INSERT OR IGNORE INTO learned_rules (header, pattern, groups, type, instrument, status, origin) VALUES (?, ?, ?, ?, ?, ?, ?)',
    r.header, r.pattern, JSON.stringify(r.groups), r.type, r.instrument, r.status, origin,
  );

// Messages the learned rules can now read: those not read before, and payees for those without one.
export async function applyRules(): Promise<number> {
  const learned = await learnedRules();
  if (!learned.length) return 0;
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`SELECT s.id, s.sender, s.body, s.receivedAt, s.templateKey, s.parsedStatus ${NEEDS_MODEL}`);
  let changed = 0;
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const p = read({ sender: row.sender, body: row.body, receivedAt: row.receivedAt, channel: 'sms' }, learned);
      if (!p || p.rule !== 'learned' || (row.parsedStatus === 'parsed' && !p.counterparty && !p.counterpartyVpa)) continue;
      await db.runAsync(
        UPSERT_TXN,
        `sms:${row.id}`, row.id, p.date, p.amountMinor, p.type, kindOf(p.type, p.status, row.body), p.status, p.instrument, p.accountLast4,
        p.counterparty, p.counterpartyVpa, p.balanceAfterMinor, p.referenceNo, p.rule,
      );
      await db.runAsync("UPDATE sms_raw SET parsedStatus = 'parsed', rule = 'learned' WHERE id = ?", row.id);
      changed++;
    }
  });
  return changed;
}

async function pushRules(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ header: string; pattern: string; groups: string; type: string; instrument: string; status: string }>(
    "SELECT header, pattern, groups, type, instrument, status FROM learned_rules WHERE origin = 'device' AND sentAt IS NULL LIMIT 100",
  );
  if (!rows.length) return;
  await api('/v1/parse/rules', { method: 'POST', token: await deviceToken(), body: { rules: rows.map((r) => ({ ...r, groups: JSON.parse(r.groups) })) } });
  const at = new Date().toISOString();
  for (const r of rows) await db.runAsync('UPDATE learned_rules SET sentAt = ? WHERE header = ? AND pattern = ?', at, r.header, r.pattern);
}

// Once a day. A shared rule is checked here too: it came from other phones.
async function pullShared(): Promise<void> {
  const last = Number((await getSetting('rules.pulledAt')) ?? 0);
  if (Date.now() - last < PULL_EVERY) return;
  const res = await api<LearnedRulesResponse>('/v1/parse/rules', { token: await deviceToken() });
  for (const r of res.rules) if (safePattern(r.pattern, r.groups)) await saveRule(r, 'shared');
  await setSetting('rules.pulledAt', String(Date.now()));
}
