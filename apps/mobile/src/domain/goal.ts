// One goal in v1. The daily number sets its monthly share aside before anything is spendable.
export type Goal = { name: string; amountMinor: number; targetDate: string };

// Whole months from now to the target, at least one, so the goal is met by its date.
export function monthsUntil(targetDate: string, now: Date): number {
  const t = new Date(targetDate);
  return Math.max(1, (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()));
}

// Rounded up to the next rupee, so the saved total never falls short of the goal.
export function monthlySetAside(goal: Goal, now: Date): number {
  return Math.ceil(goal.amountMinor / monthsUntil(goal.targetDate, now) / 100) * 100;
}
