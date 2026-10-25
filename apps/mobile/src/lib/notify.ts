import * as Notifications from 'expo-notifications';

import type { Alert } from '@/domain/alerts';
import { formatDate, formatMoney } from '@/lib/format';

const MORNING = 'morning:';
const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export async function setUpNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  await Notifications.setNotificationChannelAsync('daily', { name: 'Morning number', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationChannelAsync('alerts', { name: 'Alerts', importance: Notifications.AndroidImportance.HIGH });
}

// Replaces every scheduled morning number with the given ones (none turns them off).
export async function scheduleMornings(list: { date: Date; safeMinor: number }[], nextSalary: string | null): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((n) => n.identifier.startsWith(MORNING)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  for (const m of list) {
    await Notifications.scheduleNotificationAsync({
      identifier: MORNING + localDay(m.date),
      content: {
        title: `${formatMoney({ amountMinor: m.safeMinor, currency: 'INR' })} is safe to spend today`,
        body: nextSalary ? `Until your salary on ${formatDate(new Date(nextSalary))}.` : '',
        data: { url: '/' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: m.date, channelId: 'daily' },
    });
  }
}

export async function scheduleAlert(a: Alert): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: a.key,
    content: { title: a.title, body: a.body, data: { url: `/alert/${encodeURIComponent(a.key)}` } },
    trigger: a.fireAt ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.fireAt, channelId: 'alerts' } : { channelId: 'alerts' },
  });
}

const SUNDAY = 'sunday:';

// The Sunday game reminder at 7 PM, or none when the game is played or not open.
export async function scheduleSundayGame(at: Date | null, category: string | null): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((n) => n.identifier.startsWith(SUNDAY)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!at || !category) return;
  await Notifications.scheduleNotificationAsync({
    identifier: SUNDAY + localDay(at),
    content: { title: 'Your Sunday game is ready', body: `Guess what you spent on ${category.toLowerCase()} this week.`, data: { url: '/sunday' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'daily' },
  });
}

export const cancelAlert = (key: string) => Notifications.cancelScheduledNotificationAsync(key);

export const cancelAllNotifications = () => Notifications.cancelAllScheduledNotificationsAsync();
