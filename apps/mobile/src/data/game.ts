import type { Category } from '@finapp/shared';

import { getDb, getSetting } from './db';
import type { Money } from './refresh';
import { unknownSpend } from '@/domain/asks';
import { jarDelta, moneyIq, pickCategory, spendIn, streak, weekKey, weekStart, type MoneyIq } from '@/domain/game';

export type SideGame = 'whos_this' | 'worth_it' | 'higher_lower' | 'plan_check';
const SIDE_GAMES: SideGame[] = ['whos_this', 'worth_it', 'higher_lower', 'plan_check'];

export type GameWeek = {
  week: string;
  category: Category;
  guessMinor: number;
  actualMinor: number;
  accuracy: number;
  predictionMinor: number | null;
  jarMinor: number;
  sideGame: SideGame | null;
  playedAt: string;
};

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// The week the game is about: this week on Sunday, and the week just ended on Monday as a day's grace.
export function gameWeekOf(now: Date): Date | null {
  if (now.getDay() === 0) return weekStart(now);
  if (now.getDay() === 1) return addDays(weekStart(now), -7);
  return null;
}

export type SundayState = {
  // The game to play now, or null when there is none (not Sunday, already played, too early, no data).
  game: { week: Date; category: Category; side: SideGame } | null;
  rows: GameWeek[];
  iq: MoneyIq | null;
  streak: { weeks: number; frozen: number };
  jarMinor: number;
  // Last week's prediction, as this week's soft target.
  target: { category: Category; predictionMinor: number; spentMinor: number } | null;
};

export async function sundayState(money: Money, now = new Date()): Promise<SundayState> {
  const rows = await (await getDb()).getAllAsync<GameWeek>('SELECT * FROM game_weeks ORDER BY week');
  const onboardedAt = Date.parse((await getSetting('onboarding.at')) ?? now.toISOString());
  const week = gameWeekOf(now);
  const played = new Set(rows.map((r) => r.week));
  // From week 2: the first week has Money Wrapped instead.
  const category = week && now.getTime() - onboardedAt >= 7 * DAY && !played.has(weekKey(week)) ? pickCategory(money.txns, week) : null;

  let side: SideGame = SIDE_GAMES[Math.floor((week?.getTime() ?? 0) / (7 * DAY)) % SIDE_GAMES.length]!;
  // Who's This? needs unknown payees; with none, the next game in the rotation plays instead.
  if (side === 'whos_this' && !unknownSpend(money.txns, now).unknownPayees.length) side = 'worth_it';

  const thisWeek = weekStart(now);
  const last = rows.find((r) => r.week === weekKey(addDays(thisWeek, -7)) && r.predictionMinor !== null);
  return {
    game: week && category ? { week, category, side } : null,
    rows,
    iq: moneyIq(rows.map((r) => r.accuracy)),
    streak: streak(rows.map((r) => r.week), now),
    jarMinor: rows.reduce((s, r) => s + r.jarMinor, 0),
    target: last
      ? { category: last.category, predictionMinor: last.predictionMinor!, spentMinor: spendIn(money.txns, last.category, thisWeek, addDays(thisWeek, 7)).totalMinor }
      : null,
  };
}

// The goal jar gets what the game week came in under the prediction made the week before.
export function jarFor(rows: GameWeek[], money: Money, week: Date): number {
  const prev = rows.find((r) => r.week === weekKey(addDays(week, -7)) && r.predictionMinor !== null);
  return jarDelta(prev ? { category: prev.category, predictionMinor: prev.predictionMinor! } : null, money.txns, week);
}

export async function saveWeek(row: Omit<GameWeek, 'playedAt'>): Promise<void> {
  await (await getDb()).runAsync(
    `INSERT OR REPLACE INTO game_weeks (week, category, guessMinor, actualMinor, accuracy, predictionMinor, jarMinor, sideGame, playedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.week, row.category, row.guessMinor, row.actualMinor, row.accuracy, row.predictionMinor, row.jarMinor, row.sideGame, new Date().toISOString(),
  );
}

export async function saveSideAnswers(week: string, game: SideGame, answers: { subject: string; answer: string }[]): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  for (const a of answers) await db.runAsync('INSERT INTO side_answers (week, game, subject, answer, answeredAt) VALUES (?, ?, ?, ?, ?)', week, game, a.subject, a.answer, at);
}
