import { getDb, getSetting, setSetting } from './db';
import type { Money } from './refresh';
import { SmsInbox } from '../../modules/sms-inbox';
import { nextAsk, unknownSpend, type Ask, type AskState, type AskType, type UnknownPayee } from '@/domain/asks';

const DAY = 86_400_000;
const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// Distinct days the daily number was opened; the label ask waits for the second.
export async function recordOpen(now = new Date()): Promise<number> {
  const days = new Set(JSON.parse((await getSetting('home.days')) ?? '[]') as string[]);
  days.add(localDay(now));
  const kept = [...days].slice(-30);
  await setSetting('home.days', JSON.stringify(kept));
  return kept.length;
}

export async function markAsk(type: AskType, outcome: 'shown' | 'accepted' | 'declined', trigger?: string): Promise<void> {
  const now = new Date().toISOString();
  const db = await getDb();
  await db.runAsync('INSERT OR IGNORE INTO asks (type) VALUES (?)', type);
  if (outcome === 'shown') await db.runAsync('UPDATE asks SET shownAt = ? WHERE type = ?', now, type);
  if (outcome === 'accepted') await db.runAsync('UPDATE asks SET acceptedAt = ? WHERE type = ?', now, type);
  if (outcome === 'declined') await db.runAsync('UPDATE asks SET declinedAt = ?, declinedTrigger = ? WHERE type = ?', now, trigger ?? null, type);
}

export type CurrentAsk = Ask & { unknownPayees: UnknownPayee[]; unknownMinor: number; spendMinor: number };

export async function currentAsk(money: Money, now = new Date()): Promise<CurrentAsk | null> {
  const db = await getDb();
  const states = await db.getAllAsync<AskState>('SELECT type, acceptedAt, declinedAt, declinedTrigger FROM asks');
  const onboardedAt = Date.parse((await getSetting('onboarding.at')) ?? now.toISOString());
  const spend = unknownSpend(money.txns, now);
  const ask = nextAsk(
    {
      ...spend,
      openDays: (JSON.parse((await getSetting('home.days')) ?? '[]') as string[]).length,
      daysSinceOnboarding: Math.floor((now.getTime() - onboardedAt) / DAY),
      // Without the Android module (iOS, Expo Go) there is nothing to turn on, so never ask.
      notificationAccess: SmsInbox ? SmsInbox.hasNotificationAccess() : true,
      hasGoal: !!money.goal,
    },
    states,
    now,
  );
  return ask ? { ...ask, ...spend } : null;
}
