// The six v1 alerts from the PRD and the two-a-day cap. Pure: works out what should fire and when;
// the notification layer schedules it. Only events after onboarding alert, so the first scan of 12
// months never floods the user; forward-looking alerts (bounce, card due, pace) need no such guard.
import { formatDate, formatMoney } from '@/lib/format';

import { isPaid } from './cards';
import type { Recurring, Txn } from './detect';
import type { SafeToSpend } from './safeToSpend';

export type AlertType = 'bounce' | 'card_due' | 'new_autopay' | 'price_hike' | 'stuck_refund' | 'over_pace';

export type Alert = {
  key: string;
  type: AlertType;
  // Null fires straight away.
  fireAt: Date | null;
  title: string;
  body: string;
  txnIds: string[];
};

export type Statement = { id: string; accountLast4: string | null; totalDueMinor: number; minDueMinor: number | null; dueDate: string; receivedAt: string };
export type Mandate = { id: string; payee: string | null; amountMinor: number | null; receivedAt: string };
export type Balance = { balanceMinor: number; asOf: string };

export type AlertInput = {
  txns: Txn[];
  recurring: Recurring[];
  balances: Map<string, Balance>;
  statements: Statement[];
  mandates: Mandate[];
  safe: SafeToSpend | null;
  onboardedAt: Date;
};

const DAY = 86_400_000;
const STUCK_AFTER = 72 * 3_600_000;
const RECENT = 2 * DAY;
const ALERT_HOUR = 9;
const PACE_HOUR = 20;
export const DAILY_CAP = 2;
// Bounce risk and card due always send, whatever the cap.
const ALWAYS: AlertType[] = ['bounce', 'card_due'];

const inr = (amountMinor: number) => formatMoney({ amountMinor, currency: 'INR' });
const day = (iso: string | Date) => formatDate(new Date(iso));
const at = (date: Date, daysBefore: number, hour: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBefore, hour);
const nameOf = (t: Txn) => t.counterparty ?? t.counterpartyVpa ?? 'a payee';
const payeeKey = (t: Txn) => (t.counterparty ?? t.counterpartyVpa ?? '').toLowerCase().replace(/[^a-z0-9@]/g, '');
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function bounce(input: AlertInput, now: Date): Alert[] {
  const out: Alert[] = [];
  for (const r of input.recurring) {
    if (r.direction !== 'debit' || r.cadence !== 'monthly' || !r.accountLast4) continue;
    const due = new Date(r.nextDue);
    const balance = input.balances.get(r.accountLast4);
    if (!balance || due <= now || due.getTime() - now.getTime() > 35 * DAY || r.amountMinor <= balance.balanceMinor) continue;
    for (const before of [3, 1]) {
      const fireAt = at(due, before, ALERT_HOUR);
      if (fireAt <= now) continue;
      out.push({
        key: `bounce:${r.key}:${localDay(due)}:${before}`,
        type: 'bounce',
        fireAt,
        title: `Top up before ${r.label} on ${day(due)}`,
        body: `${inr(r.amountMinor)} for ${r.label} is due on ${day(due)}. Account ending ${r.accountLast4} had ${inr(balance.balanceMinor)} on ${day(balance.asOf)}.`,
        txnIds: r.txnIds,
      });
    }
  }
  return out;
}

function cardDue(input: AlertInput, now: Date): Alert[] {
  const out: Alert[] = [];
  // The latest statement per card; a card payment after it means the bill is paid.
  const latest = new Map<string, Statement>();
  for (const s of input.statements) {
    const k = s.accountLast4 ?? s.id;
    if (!latest.has(k) || latest.get(k)!.receivedAt < s.receivedAt) latest.set(k, s);
  }
  for (const s of latest.values()) {
    if (isPaid(s, input.txns)) continue;
    const due = new Date(`${s.dueDate}T00:00:00`);
    for (const before of [5, 1]) {
      const fireAt = at(due, before, ALERT_HOUR);
      if (fireAt <= now) continue;
      out.push({
        key: `card:${s.accountLast4 ?? s.id}:${s.dueDate}:${before}`,
        type: 'card_due',
        fireAt,
        title: `Card bill due on ${day(due)}`,
        body:
          `${inr(s.totalDueMinor)} is due on your card${s.accountLast4 ? ` ending ${s.accountLast4}` : ''}.` +
          (s.minDueMinor ? ` The minimum is ${inr(s.minDueMinor)}.` : ''),
        txnIds: [],
      });
    }
  }
  return out;
}

const fresh = (iso: string, input: AlertInput, now: Date) =>
  Date.parse(iso) >= input.onboardedAt.getTime() && now.getTime() - Date.parse(iso) <= RECENT;

function newAutopay(input: AlertInput, now: Date): Alert[] {
  return input.mandates
    .filter((m) => fresh(m.receivedAt, input, now))
    .map((m) => ({
      key: `mandate:${m.id}`,
      type: 'new_autopay' as const,
      fireAt: null,
      title: 'New autopay set up',
      body: `${m.payee ?? 'A payee'} can now take ${m.amountMinor ? `up to ${inr(m.amountMinor)}` : 'money'} from your account automatically. If you did not set this up, call your bank.`,
      txnIds: [],
    }));
}

const HIKE = 1.05;

function priceHike(input: AlertInput, now: Date): Alert[] {
  const out: Alert[] = [];
  const debits = input.txns.filter((t) => t.direction === 'debit' && t.status === 'success' && payeeKey(t));
  for (const t of debits) {
    if (!fresh(t.date, input, now)) continue;
    const prev = debits.find((p) => {
      const gap = (Date.parse(t.date) - Date.parse(p.date)) / DAY;
      return p.id !== t.id && payeeKey(p) === payeeKey(t) && gap >= 25 && gap <= 35;
    });
    if (!prev || t.amountMinor <= prev.amountMinor * HIKE) continue;
    out.push({
      key: `hike:${t.id}`,
      type: 'price_hike',
      fireAt: null,
      title: `${nameOf(t)} went up`,
      body: `${inr(t.amountMinor)} this time, up from ${inr(prev.amountMinor)} on ${day(prev.date)}.`,
      txnIds: [prev.id, t.id],
    });
  }
  return out;
}

function stuckRefund(input: AlertInput, now: Date): Alert[] {
  const credits = input.txns.filter((t) => t.direction === 'credit');
  return input.txns
    .filter((t) => t.direction === 'debit' && (t.status === 'failed' || t.refundExpected))
    .filter((t) => Date.parse(t.date) + STUCK_AFTER >= input.onboardedAt.getTime())
    .filter((t) => !credits.some((c) => c.amountMinor === t.amountMinor && c.date > t.date))
    .map((t) => {
      const due = new Date(Date.parse(t.date) + STUCK_AFTER);
      return {
        key: `stuck:${t.id}`,
        type: 'stuck_refund' as const,
        fireAt: due > now ? due : null,
        title: 'A refund has not arrived',
        body: `${inr(t.amountMinor)} to ${nameOf(t)} on ${day(t.date)} has not come back after 3 days. Your bank can trace it with the reference in that message.`,
        txnIds: [t.id],
      };
    });
}

function overPace(input: AlertInput, now: Date): Alert[] {
  const pace = input.safe?.pace;
  const fireAt = at(now, 0, PACE_HOUR);
  if (!pace?.over || fireAt <= now) return [];
  return [
    {
      key: `pace:${localDay(now)}`,
      type: 'over_pace',
      fireAt,
      title: 'Spending is ahead of your usual pace',
      body: `${inr(input.safe!.spentMinor)} so far this month. By this day you usually spend ${inr(pace.usualMinor)}.`,
      txnIds: [],
    },
  ];
}

export function alertsFor(input: AlertInput, now: Date): Alert[] {
  return [bounce, cardDue, newAutopay, priceHike, stuckRefund, overPace].flatMap((f) => f(input, now));
}

export type Planned = { key: string; fireAt: string; suppressed: boolean };

// Decides what to schedule now. Alerts already planned stay as they are; a future one no longer
// wanted is cancelled; a new one is suppressed when its day already has two, unless it always sends.
export function plan(wanted: Alert[], planned: Planned[], now: Date): { schedule: Alert[]; suppress: Alert[]; cancel: string[] } {
  const known = new Map(planned.map((p) => [p.key, p]));
  const wantedKeys = new Set(wanted.map((a) => a.key));
  const cancel = planned.filter((p) => !p.suppressed && !wantedKeys.has(p.key) && Date.parse(p.fireAt) > now.getTime()).map((p) => p.key);
  const perDay = new Map<string, number>();
  for (const p of planned) {
    if (p.suppressed || cancel.includes(p.key)) continue;
    const d = localDay(new Date(p.fireAt));
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const schedule: Alert[] = [];
  const suppress: Alert[] = [];
  const incoming = wanted
    .filter((a) => !known.has(a.key))
    .sort((a, b) => Number(ALWAYS.includes(b.type)) - Number(ALWAYS.includes(a.type)) || (a.fireAt ?? now).getTime() - (b.fireAt ?? now).getTime());
  for (const a of incoming) {
    const d = localDay(a.fireAt ?? now);
    const count = perDay.get(d) ?? 0;
    if (count >= DAILY_CAP && !ALWAYS.includes(a.type)) {
      suppress.push(a);
      continue;
    }
    schedule.push(a);
    perDay.set(d, count + 1);
  }
  return { schedule, suppress, cancel };
}
