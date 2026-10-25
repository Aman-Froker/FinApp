import { getDb, getGoal, getSalary, getSetting, type GoalRow, type SalaryRow } from './db';
import { runFallback } from './fallback';
import { balances, loadHistory, notices, syncInbox } from './ingest';
import { dropEmailTwins, pullEmail } from './email';
import { lookupShared, matchUpiNotes } from './labels';
import { alertsFor, plan, type Planned } from '@/domain/alerts';
import type { Recurring, Txn } from '@/domain/detect';
import { monthlySetAside } from '@/domain/goal';
import { mornings, safeToSpend, type SafeToSpend } from '@/domain/safeToSpend';
import { cancelAlert, scheduleAlert, scheduleMornings, scheduleSundayGame } from '@/lib/notify';
import { sundayState } from './game';

const MORNINGS_AHEAD = 7;

export type Money = {
  txns: Txn[];
  recurring: Recurring[];
  salary: SalaryRow | null;
  goal: (GoalRow & { monthlyMinor: number }) | null;
  excluded: Set<string>;
  safe: SafeToSpend | null;
};

export async function excludedKeys(): Promise<Set<string>> {
  return new Set(JSON.parse((await getSetting('committed.excluded')) ?? '[]') as string[]);
}

// Everything the number and its breakdown are made of, from the phone's own database.
export async function loadMoney(now = new Date()): Promise<Money> {
  const [{ txns, recurring }, salary, excluded, saved] = await Promise.all([loadHistory(), getSalary(), excludedKeys(), getGoal()]);
  const goal = saved ? { ...saved, monthlyMinor: monthlySetAside(saved, now) } : null;
  const safe = salary ? safeToSpend({ txns, recurring, salary, excluded, goalMinor: goal?.monthlyMinor }, now) : null;
  return { txns, recurring, salary, goal, excluded, safe };
}

// Schedules the coming morning numbers and plans alerts against what was already planned.
async function replan(now: Date): Promise<void> {
  const money = await loadMoney(now);
  const morningOn = (await getSetting('notify.morning')) === 'yes';
  await scheduleMornings(morningOn && money.safe ? mornings(money.safe, now, MORNINGS_AHEAD) : [], money.safe?.nextSalary ?? null);
  // Sunday at 7 PM, only while this week's game is open and unplayed. It sits outside the alert cap.
  const sunday = await sundayState(money, now);
  const sevenPm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19);
  await scheduleSundayGame(sunday.game && now.getDay() === 0 && sevenPm > now ? sevenPm : null, sunday.game?.category ?? null);

  const db = await getDb();
  const { statements, mandates } = await notices();
  const onboardedAt = new Date((await getSetting('onboarding.at')) ?? now.toISOString());
  const wanted = alertsFor({ txns: money.txns, recurring: money.recurring, balances: await balances(), statements, mandates, safe: money.safe, onboardedAt }, now);
  const planned = await db.getAllAsync<Planned>('SELECT key, fireAt, suppressed FROM alerts');
  const { schedule, suppress, cancel } = plan(wanted, planned.map((p) => ({ ...p, suppressed: !!p.suppressed })), now);
  for (const key of cancel) {
    await cancelAlert(key);
    await db.runAsync('DELETE FROM alerts WHERE key = ?', key);
  }
  for (const [a, suppressed] of [...schedule.map((a) => [a, 0] as const), ...suppress.map((a) => [a, 1] as const)]) {
    if (!suppressed) await scheduleAlert(a);
    await db.runAsync(
      'INSERT INTO alerts (key, type, title, body, fireAt, txnIds, suppressed) VALUES (?, ?, ?, ?, ?, ?, ?)',
      a.key, a.type, a.title, a.body, (a.fireAt ?? now).toISOString(), JSON.stringify(a.txnIds), suppressed,
    );
  }
}

const listeners = new Set<() => void>();
export function onRefreshed(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let running: Promise<boolean> | null = null;

// Reads new messages, then replans the number and alerts. One at a time: the SMS task and the app
// coming to the foreground can ask together. Resolves false when there is nothing to read yet.
export function refreshAll(): Promise<boolean> {
  running ??= (async () => {
    if ((await getSetting('sms.consent')) !== 'yes' || (await getSetting('onboarding.done')) !== 'yes') return false;
    await syncInbox();
    await matchUpiNotes();
    // Forwarded bank emails, collected from the server. Best effort like the other network steps.
    await pullEmail().catch(() => 0);
    await dropEmailTwins();
    // Best effort: the network steps must never hold up or break the refresh.
    await lookupShared().catch(() => 0);
    await runFallback().catch(() => 0);
    const now = new Date();
    await replan(now);
    listeners.forEach((f) => f());
    return true;
  })().finally(() => {
    running = null;
  });
  return running;
}
