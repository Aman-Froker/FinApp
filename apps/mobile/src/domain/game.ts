// The Sunday ritual: Guess Your Week, Money IQ, the streak and the goal jar. Pure functions; every
// answer is stored so it can train labels and predictions.
import type { Category } from '@finapp/shared';

import type { Txn } from './detect';

const DAY = 86_400_000;

// Brand names that are enough to place a payment in a category when the user has not labelled it.
const BRANDS: [Category, RegExp][] = [
  ['Food delivery', /swiggy(?!\s*instamart)|zomato|eatsure|dominos|pizza hut/i],
  ['Groceries', /blinkit|zepto|instamart|bigbasket|dmart|jiomart|grofers|more retail|reliance fresh/i],
  ['Transport', /\buber\b|\bola\b|rapido|irctc|metro|fastag|petrol|fuel|hpcl|bpcl|iocl|indian oil|redbus/i],
  ['Shopping', /amazon|flipkart|myntra|ajio|meesho|nykaa|croma|decathlon/i],
  ['Entertainment', /netflix|hotstar|spotify|prime video|bookmyshow|sonyliv|youtube/i],
  ['Bills', /airtel|\bjio\b|vodafone|bescom|electricity|broadband|fibernet|tata play|gas bill/i],
  ['Health', /apollo|pharmeasy|1mg|netmeds|practo|medplus|hospital|clinic/i],
];

export function categoryOf(t: Txn): Category | null {
  if (t.category) return t.category as Category;
  const name = `${t.counterparty ?? ''} ${t.counterpartyVpa ?? ''}`;
  return BRANDS.find(([, re]) => re.test(name))?.[0] ?? null;
}

// Weeks run Monday to Sunday in the phone's time zone; a week is named by its Monday.
export function weekStart(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const weekKey = (d: Date) => localDate(weekStart(d));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const isSpend = (t: Txn) => t.direction === 'debit' && (t.kind === 'spend' || t.kind === 'fee') && t.status === 'success';

export function spendIn(txns: Txn[], category: Category, from: Date, to: Date): { totalMinor: number; txns: Txn[] } {
  const hits = txns.filter((t) => isSpend(t) && categoryOf(t) === category && Date.parse(t.date) >= from.getTime() && Date.parse(t.date) < to.getTime());
  return { totalMinor: hits.reduce((s, t) => s + t.amountMinor, 0), txns: hits };
}

export const ROTATION: Category[] = ['Food delivery', 'Shopping', 'Transport', 'Groceries'];

// The category to guess this week: the rotation, then the user's top category, skipping any with
// no spending in the last 8 weeks (a ₹0 guess teaches nothing). Null when nothing qualifies.
export function pickCategory(txns: Txn[], now: Date): Category | null {
  const week = weekStart(now);
  const recent = (c: Category, weeks: number) => spendIn(txns, c, addDays(week, -7 * weeks), addDays(week, 7)).totalMinor;
  const all = [...new Set(txns.filter(isSpend).map(categoryOf).filter((c): c is Category => !!c && c !== 'Family and friends' && c !== 'Other'))];
  const top = all.sort((a, b) => recent(b, 4) - recent(a, 4))[0];
  const order = top ? [...ROTATION, top] : ROTATION;
  const start = Math.floor(week.getTime() / (7 * DAY)) % order.length;
  for (let i = 0; i < order.length; i++) {
    const c = order[(start + i) % order.length]!;
    if (recent(c, 8) > 0) return c;
  }
  return null;
}

// 100 for a perfect guess, falling with the gap as a share of the actual, never below zero.
export function accuracy(guessMinor: number, actualMinor: number): number {
  if (actualMinor === 0) return guessMinor === 0 ? 100 : 0;
  return Math.max(0, Math.round(100 - (100 * Math.abs(guessMinor - actualMinor)) / actualMinor));
}

export type MoneyIq = { score: number; level: 1 | 2 | 3 | 4 };

// The mean accuracy of the last four guesses, oldest first in the input.
export function moneyIq(accuracies: number[]): MoneyIq | null {
  const last = accuracies.slice(-4);
  if (!last.length) return null;
  const score = Math.round(last.reduce((s, a) => s + a, 0) / last.length);
  return { score, level: score >= 90 ? 4 : score >= 70 ? 3 : score >= 40 ? 2 : 1 };
}

// Consecutive weeks played up to this one. A week not yet played does not break the streak until
// it is over. One missed week a calendar month is covered by a free freeze.
export function streak(played: string[], now: Date): { weeks: number; frozen: number } {
  const set = new Set(played);
  let week = weekStart(now);
  if (!set.has(localDate(week))) week = addDays(week, -7);
  const frozenMonths = new Set<string>();
  let weeks = 0;
  for (;;) {
    if (set.has(localDate(week))) weeks++;
    else {
      const month = localDate(week).slice(0, 7);
      // A freeze only bridges to earlier play; it never starts a streak on its own.
      const earlier = played.some((w) => w < localDate(week));
      if (frozenMonths.has(month) || !earlier) break;
      frozenMonths.add(month);
    }
    week = addDays(week, -7);
  }
  return { weeks, frozen: frozenMonths.size };
}

// Goal jar: when this week's spend in last week's predicted category came in under the prediction,
// the difference moves into the jar. Visual only in v1; no money moves.
export function jarDelta(prediction: { category: Category; predictionMinor: number } | null, txns: Txn[], now: Date): number {
  if (!prediction) return 0;
  const week = weekStart(now);
  const actual = spendIn(txns, prediction.category, week, addDays(week, 7)).totalMinor;
  return Math.max(0, prediction.predictionMinor - actual);
}
