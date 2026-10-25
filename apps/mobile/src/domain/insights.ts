// Money Wrapped: the Day 1 insight cards, computed from the user's own transactions and scored
// per the PRD. Pure functions; the screen only words what is returned here.
import { detectSalary, monthKey, payeeOf, type Recurring, type Txn } from './detect';

export type InsightType = 'habit' | 'runway' | 'fees' | 'autopays' | 'limbo' | 'creep';

// One row in the sheet behind a card's action: a transaction or a payee total.
export type InsightLine = { id: string; label: string; amountMinor: number; date?: string };

export type Insight =
  | { type: 'habit'; name: string; merchants: string[]; totalMinor: number; months: number; lines: InsightLine[] }
  | { type: 'runway'; runOutDate: string; nextSalaryDate: string; overMinor: number; lines: InsightLine[] }
  | { type: 'fees'; totalMinor: number; months: number; lines: InsightLine[] }
  | { type: 'autopays'; count: number; yearlyMinor: number; lines: InsightLine[] }
  | { type: 'limbo'; totalMinor: number; lines: InsightLine[] }
  | { type: 'creep'; percent: number; recentMinor: number; earlierMinor: number; lines: InsightLine[] };

export type Scored = Insight & { annualMinor: number; score: number };

export type Summary = { totalMinor: number; months: number; top: InsightLine[] };

const DAY = 86_400_000;
const time = (t: { date: string }) => Date.parse(t.date);
const sum = (xs: { amountMinor: number }[]) => xs.reduce((s, x) => s + x.amountMinor, 0);
const name = payeeOf;
const lineOf = (t: Txn, label = name(t)): InsightLine => ({ id: t.id, label, amountMinor: t.amountMinor, date: t.date });
const isSpend = (t: Txn) => t.direction === 'debit' && t.kind === 'spend' && t.status === 'success';

// Months of history the figures cover, so a card says "in 4 months" rather than inventing a year.
const monthsCovered = (txns: Txn[], now: Date) =>
  txns.length ? Math.max(1, Math.round((now.getTime() - Math.min(...txns.map(time))) / (30.44 * DAY))) : 0;
const annualise = (minor: number, months: number) => Math.round((minor * 12) / Math.max(months, 1));

const HABITS: { name: string; match: RegExp }[] = [
  { name: 'food delivery', match: /swiggy|zomato|eatsure/i },
  { name: 'quick commerce', match: /blinkit|zepto|instamart|bigbasket|dunzo/i },
  { name: 'rides', match: /\buber\b|\bola\b|rapido/i },
  { name: 'online shopping', match: /amazon|flipkart|myntra|ajio|meesho|nykaa/i },
];

function habit(spend: Txn[], months: number): Insight | null {
  let best: Extract<Insight, { type: 'habit' }> | null = null;
  for (const h of HABITS) {
    const hits = spend.filter((t) => h.match.test(name(t)));
    if (!hits.length) continue;
    const byMerchant = new Map<string, number>();
    for (const t of hits) {
      const m = name(t).match(h.match)![0].toLowerCase();
      byMerchant.set(m, (byMerchant.get(m) ?? 0) + t.amountMinor);
    }
    const merchants = [...byMerchant.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([m]) => m.replace(/\b\w/g, (c) => c.toUpperCase()));
    const totalMinor = sum(hits);
    if (!best || totalMinor > best.totalMinor) {
      best = { type: 'habit', name: h.name, merchants, totalMinor, months, lines: hits.map((t) => lineOf(t)).reverse() };
    }
  }
  return best;
}

const RUNWAY_MARGIN_DAYS = 5;

// The day spending since the previous salary passed that salary, in the last complete pay cycle.
function runway(txns: Txn[], recurring: Recurring[], now: Date): Insight | null {
  const salary = detectSalary(txns, recurring, now);
  if (!salary?.sure || salary.txnIds.length < 2) return null;
  const credits = txns.filter((t) => salary.txnIds.includes(t.id)).sort((a, b) => time(a) - time(b));
  const start = credits.at(-2)!;
  const end = credits.at(-1)!;
  const cycle = txns
    .filter((t) => (isSpend(t) || t.kind === 'fee') && time(t) >= time(start) && time(t) < time(end))
    .sort((a, b) => time(a) - time(b));
  let spent = 0;
  const ranOut = cycle.find((t) => (spent += t.amountMinor) >= start.amountMinor);
  if (!ranOut || time(end) - time(ranOut) < RUNWAY_MARGIN_DAYS * DAY) return null;
  return { type: 'runway', runOutDate: ranOut.date, nextSalaryDate: end.date, overMinor: sum(cycle) - start.amountMinor, lines: [] };
}

function fees(txns: Txn[], months: number): Insight | null {
  const hits = txns.filter((t) => t.kind === 'fee' && t.status === 'success');
  if (!hits.length) return null;
  return { type: 'fees', totalMinor: sum(hits), months, lines: hits.map((t) => lineOf(t, t.counterparty ?? 'Bank charge')).reverse() };
}

function autopays(recurring: Recurring[], now: Date): Insight | null {
  const active = recurring.filter(
    (r) =>
      r.direction === 'debit' &&
      r.automatic &&
      now.getTime() - Date.parse(r.lastSeen) <= (r.cadence === 'weekly' ? 14 : 45) * DAY,
  );
  if (!active.length) return null;
  const yearly = (r: Recurring) => r.amountMinor * (r.cadence === 'weekly' ? 52 : 12);
  return {
    type: 'autopays',
    count: active.length,
    yearlyMinor: active.reduce((s, r) => s + yearly(r), 0),
    lines: active.sort((a, b) => yearly(b) - yearly(a)).map((r) => ({ id: r.key, label: r.label, amountMinor: r.amountMinor })),
  };
}

const LIMBO_WAIT_DAYS = 7;
const LIMBO_MATCH_DAYS = 30;

// Failed payments whose money was taken and no credit of the same amount came back within 30 days.
function limbo(txns: Txn[], now: Date): Insight | null {
  const credits = txns.filter((t) => t.direction === 'credit');
  const open = txns.filter(
    (t) =>
      t.direction === 'debit' &&
      t.status === 'failed' &&
      now.getTime() - time(t) >= LIMBO_WAIT_DAYS * DAY &&
      !credits.some((c) => c.amountMinor === t.amountMinor && time(c) >= time(t) && time(c) - time(t) <= LIMBO_MATCH_DAYS * DAY),
  );
  if (!open.length) return null;
  return { type: 'limbo', totalMinor: sum(open), lines: open.map((t) => lineOf(t)).reverse() };
}

const CREEP_MIN_PERCENT = 10;

// Average monthly spend over the last three full months against the three full months before.
function creep(spend: Txn[], now: Date): Insight | null {
  const fullMonths = [1, 2, 3, 4, 5, 6].map((i) => monthKey(new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 15)).toISOString()));
  const first = spend.length ? monthKey(spend.reduce((a, b) => (time(a) < time(b) ? a : b)).date) : null;
  if (!first || first > fullMonths[5]!) return null;
  const recentSet = new Set(fullMonths.slice(0, 3));
  const earlierSet = new Set(fullMonths.slice(3));
  const recent = spend.filter((t) => recentSet.has(monthKey(t.date)));
  const earlier = spend.filter((t) => earlierSet.has(monthKey(t.date)));
  const recentMinor = Math.round(sum(recent) / 3);
  const earlierMinor = Math.round(sum(earlier) / 3);
  if (!earlierMinor) return null;
  const percent = Math.round((100 * (recentMinor - earlierMinor)) / earlierMinor);
  if (percent < CREEP_MIN_PERCENT) return null;

  const byPayee = new Map<string, number>();
  for (const t of recent) byPayee.set(name(t), (byPayee.get(name(t)) ?? 0) + t.amountMinor / 3);
  for (const t of earlier) byPayee.set(name(t), (byPayee.get(name(t)) ?? 0) - t.amountMinor / 3);
  const lines = [...byPayee.entries()]
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, d]) => ({ id: label, label, amountMinor: Math.round(d) }));
  return { type: 'creep', percent, recentMinor, earlierMinor, lines };
}

const WEIGHT: Record<InsightType, number> = { limbo: 1.5, fees: 1.4, autopays: 1.3, habit: 1.2, runway: 1.1, creep: 1.0 };
// The habit card's action in the PRD is a weekly cap, which needs category budgets (later).
const ACTIONABLE: Record<InsightType, boolean> = { limbo: true, fees: true, autopays: true, habit: false, runway: true, creep: true };
const MIN_ANNUAL_MINOR = 1_000_00;

function annualOf(i: Insight): number {
  switch (i.type) {
    case 'habit':
    case 'fees':
      return annualise(i.totalMinor, i.months);
    case 'autopays':
      return i.yearlyMinor;
    case 'limbo':
      return i.totalMinor;
    case 'creep':
      return (i.recentMinor - i.earlierMinor) * 12;
    case 'runway':
      // What the cycle spent beyond the salary, as a yearly figure.
      return i.overMinor * 12;
  }
}

// score = log10(annual rupees) x surprise weight x actionable (1, or 0.5 without a working action).
export function scoreInsight(type: InsightType, annualMinor: number): number {
  return Math.log10(Math.max(annualMinor / 100, 1)) * WEIGHT[type] * (ACTIONABLE[type] ? 1 : 0.5);
}

export const MAX_CARDS = 4;
export const MIN_CARDS = 3;

// Every card the data supports, qualified and scored, best first, at most four.
export function wrapped(txns: Txn[], recurring: Recurring[], now: Date): Scored[] {
  const spend = txns.filter(isSpend);
  const months = monthsCovered(txns, now);
  const found = [habit(spend, months), runway(txns, recurring, now), fees(txns, months), autopays(recurring, now), limbo(txns, now), creep(spend, now)];
  return found
    .filter((i): i is Insight => i !== null)
    .map((i) => {
      const annualMinor = annualOf(i);
      return { ...i, annualMinor, score: scoreInsight(i.type, annualMinor) };
    })
    .filter((i) => i.type === 'runway' || i.annualMinor >= MIN_ANNUAL_MINOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CARDS);
}

// "Here's your year in money": shown when fewer than three cards qualify. Top payees stand in for
// categories until categories exist.
export function summary(txns: Txn[], now: Date): Summary {
  const spend = txns.filter(isSpend);
  const byPayee = new Map<string, number>();
  for (const t of spend) byPayee.set(name(t), (byPayee.get(name(t)) ?? 0) + t.amountMinor);
  const top = [...byPayee.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, amountMinor]) => ({ id: label, label, amountMinor }));
  return { totalMinor: sum(spend), months: monthsCovered(spend, now), top };
}
