// The daily number, per the PRD with two corrections agreed in M3: every debit this cycle counts as
// spent (so a paid EMI is not spendable again) and the card bill is not committed (its swipes
// already counted on the swipe date). Pure: no database, no React.
import type { Recurring, Txn } from './detect';

export type CommittedLine = { key: string; label: string; amountMinor: number; dueDate: string };

export type Pace = { usualMinor: number; diffMinor: number; over: boolean };

export type SafeToSpend = {
  safeTodayMinor: number;
  remainingMinor: number;
  incomeMinor: number;
  committed: CommittedLine[];
  committedMinor: number;
  goalMinor: number;
  spentMinor: number;
  daysLeft: number;
  cycleStart: string;
  nextSalary: string;
  pace: Pace | null;
};

const DAY = 86_400_000;
const OVER_PACE = 1.2;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const payDate = (y: number, m: number, payDay: number) => new Date(y, m, Math.min(payDay, new Date(y, m + 1, 0).getDate()));
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY);

// The pay cycle containing `now`: from the last pay day on or before today to the next one.
export function cycleOf(now: Date, payDay: number): { start: Date; end: Date } {
  const thisMonth = payDate(now.getFullYear(), now.getMonth(), payDay);
  const start = thisMonth <= midnight(now) ? thisMonth : payDate(now.getFullYear(), now.getMonth() - 1, payDay);
  return { start, end: payDate(start.getFullYear(), start.getMonth() + 1, payDay) };
}

const isOutflow = (t: Txn) => t.direction === 'debit' && (t.kind === 'spend' || t.kind === 'fee') && t.status === 'success';

// Debits less refunds between two instants.
function spentBetween(txns: Txn[], from: Date, to: Date): number {
  let total = 0;
  for (const t of txns) {
    const at = Date.parse(t.date);
    if (at < from.getTime() || at > to.getTime()) continue;
    if (isOutflow(t)) total += t.amountMinor;
    else if (t.kind === 'refund' && t.direction === 'credit') total -= t.amountMinor;
  }
  return total;
}

// Regular payments still to leave before pay day. A monthly one seen this cycle is already paid.
function committedLines(recurring: Recurring[], start: Date, end: Date, now: Date, excluded: Set<string>): CommittedLine[] {
  const out: CommittedLine[] = [];
  const line = (r: Recurring, due: Date) => out.push({ key: r.key, label: r.label, amountMinor: r.amountMinor, dueDate: due.toISOString() });
  for (const r of recurring) {
    if (r.direction !== 'debit' || excluded.has(r.key)) continue;
    if (r.cadence === 'monthly') {
      const due = new Date(r.nextDue);
      if (due >= start && due < end && Date.parse(r.lastSeen) < start.getTime()) line(r, due);
      continue;
    }
    for (let due = new Date(r.nextDue); due < end; due = new Date(due.getTime() + 7 * DAY)) {
      if (due >= midnight(now)) line(r, due);
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// Usual spend by this day of the cycle: the median over up to six earlier complete cycles in the history.
function paceOf(txns: Txn[], start: Date, now: Date, payDay: number, spentMinor: number): Pace | null {
  const first = txns.reduce((min, t) => Math.min(min, Date.parse(t.date)), Infinity);
  const offset = now.getTime() - start.getTime();
  const samples: number[] = [];
  let s = start;
  for (let i = 0; i < 6; i++) {
    s = payDate(s.getFullYear(), s.getMonth() - 1, payDay);
    if (s.getTime() < first) break;
    samples.push(spentBetween(txns, s, new Date(s.getTime() + offset)));
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  const usualMinor = samples.length % 2 ? samples[mid]! : Math.round((samples[mid - 1]! + samples[mid]!) / 2);
  return { usualMinor, diffMinor: usualMinor - spentMinor, over: usualMinor > 0 && spentMinor > OVER_PACE * usualMinor };
}

const wholeRupees = (minor: number) => Math.floor(minor / 100) * 100;

export function safeToSpend(
  input: { txns: Txn[]; recurring: Recurring[]; salary: { amountMinor: number; payDay: number }; excluded?: Set<string>; goalMinor?: number },
  now: Date,
): SafeToSpend {
  const { start, end } = cycleOf(now, input.salary.payDay);
  const spentMinor = spentBetween(input.txns, start, now);
  const committed = committedLines(input.recurring, start, end, now, input.excluded ?? new Set());
  const committedMinor = committed.reduce((s, c) => s + c.amountMinor, 0);
  const goalMinor = input.goalMinor ?? 0;
  const remainingMinor = input.salary.amountMinor - committedMinor - goalMinor - spentMinor;
  const daysLeft = Math.max(daysBetween(now, end), 1);
  return {
    safeTodayMinor: Math.max(0, wholeRupees(remainingMinor / daysLeft)),
    remainingMinor,
    incomeMinor: input.salary.amountMinor,
    committed,
    committedMinor,
    goalMinor,
    spentMinor,
    daysLeft,
    cycleStart: start.toISOString(),
    nextSalary: end.toISOString(),
    pace: paceOf(input.txns, start, now, input.salary.payDay, spentMinor),
  };
}

// The figure each coming morning would show if nothing else is spent, up to the day before pay day.
// A new transaction reschedules them, so with no new messages these are exact.
export function mornings(s: SafeToSpend, now: Date, count: number): { date: Date; safeMinor: number }[] {
  const out: { date: Date; safeMinor: number }[] = [];
  const end = new Date(s.nextSalary);
  for (let i = 1; i <= count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 8);
    const left = daysBetween(date, end);
    if (left < 1) break;
    out.push({ date, safeMinor: Math.max(0, wholeRupees(s.remainingMinor / left)) });
  }
  return out;
}
