// Give to get: one ask at a time, only after the app has shown value, each on its own trigger.
// A declined ask comes back no sooner than 14 days later and only on a new trigger (PRD rule 3).
import { monthKey, type Txn } from './detect';

export type AskType = 'label_payees' | 'notification_access' | 'goal' | 'confirm_cards' | 'gmail' | 'account_aggregator';

// Journey order. Asks for features not built yet (cards in M6, Gmail and Account Aggregator later)
// have no trigger here, so they never show.
const ORDER: AskType[] = ['label_payees', 'notification_access', 'goal'];

export type AskState = { type: AskType; acceptedAt: string | null; declinedAt: string | null; declinedTrigger: string | null };

export type UnknownPayee = { vpa: string; totalMinor: number; count: number };

export type AskContext = {
  // Distinct days the daily number was opened.
  openDays: number;
  daysSinceOnboarding: number;
  unknownPayees: UnknownPayee[];
  unknownMinor: number;
  spendMinor: number;
  notificationAccess: boolean;
  hasGoal: boolean;
};

export type Ask = { type: AskType; trigger: string };

const DAY = 86_400_000;
export const DECLINE_COOLDOWN_DAYS = 14;
const UNKNOWN_SHARE = 0.2;
const RECENT_DAYS = 90;
export const TOP_UNKNOWN = 5;

// Spending in the last 90 days that went to a bare UPI ID with no name: what labelling would fix.
export function unknownSpend(txns: Txn[], now: Date): Pick<AskContext, 'unknownPayees' | 'unknownMinor' | 'spendMinor'> {
  const since = now.getTime() - RECENT_DAYS * DAY;
  const byVpa = new Map<string, UnknownPayee>();
  let spendMinor = 0;
  let unknownMinor = 0;
  for (const t of txns) {
    if (t.direction !== 'debit' || t.kind !== 'spend' || t.status !== 'success' || Date.parse(t.date) < since) continue;
    spendMinor += t.amountMinor;
    if (t.counterparty || !t.counterpartyVpa) continue;
    unknownMinor += t.amountMinor;
    const p = byVpa.get(t.counterpartyVpa) ?? { vpa: t.counterpartyVpa, totalMinor: 0, count: 0 };
    p.totalMinor += t.amountMinor;
    p.count += 1;
    byVpa.set(t.counterpartyVpa, p);
  }
  const unknownPayees = [...byVpa.values()].sort((a, b) => b.totalMinor - a.totalMinor).slice(0, TOP_UNKNOWN);
  return { unknownPayees, unknownMinor, spendMinor };
}

// The trigger each ask is waiting for, as a key that changes when the trigger is new.
function triggerOf(type: AskType, c: AskContext, now: Date): string | null {
  switch (type) {
    case 'label_payees':
      return c.openDays >= 2 && c.unknownPayees.length ? `payees:${c.unknownPayees.map((p) => p.vpa).sort().join(',')}` : null;
    case 'notification_access':
      return !c.notificationAccess && c.spendMinor > 0 && c.unknownMinor / c.spendMinor > UNKNOWN_SHARE ? `unknown:${monthKey(now.toISOString())}` : null;
    case 'goal':
      return !c.hasGoal && c.daysSinceOnboarding >= 7 ? `week:${Math.floor(c.daysSinceOnboarding / 7)}` : null;
    default:
      return null;
  }
}

export function nextAsk(c: AskContext, states: AskState[], now: Date): Ask | null {
  const byType = new Map(states.map((s) => [s.type, s]));
  for (const type of ORDER) {
    const trigger = triggerOf(type, c, now);
    if (!trigger) continue;
    const s = byType.get(type);
    if (s?.acceptedAt) continue;
    if (s?.declinedAt) {
      const cooled = now.getTime() - Date.parse(s.declinedAt) >= DECLINE_COOLDOWN_DAYS * DAY;
      if (!cooled || trigger === s.declinedTrigger) continue;
    }
    return { type, trigger };
  }
  return null;
}
