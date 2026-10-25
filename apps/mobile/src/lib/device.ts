import type { DeviceResponse } from '@finapp/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { api } from './api';
import { cancelAllNotifications } from './notify';
import { wipeLocalDb } from '@/data/db';

const KEY = 'finapp.deviceToken';
let pending: Promise<string> | null = null;

// Anonymous identity: registered on first use, kept in the keystore, no sign up.
export function deviceToken(): Promise<string> {
  pending ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored) return stored;
    const { token } = await api<DeviceResponse>('/v1/devices', {
      method: 'POST',
      auth: false,
      body: { platform: Platform.OS === 'ios' ? 'ios' : 'android', appVersion: '1.0.0' },
    });
    await SecureStore.setItemAsync(KEY, token);
    return token;
  })().catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}

type Props = Record<string, string | number | boolean>;

// Best effort: analytics must never block or break a screen.
export function track(name: string, properties?: Props): void {
  deviceToken()
    .then((token) =>
      api('/v1/events', { method: 'POST', token, body: { events: [{ name, properties, occurredAt: new Date().toISOString() }] } }),
    )
    .catch((e) => {
      if (__DEV__) console.warn(`track(${name}) failed`, e);
    });
}

// Server first: if it fails the user is told and the phone keeps its data, so nothing is half deleted.
export async function deleteAllData(): Promise<void> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored) await api('/v1/devices/me', { method: 'DELETE', token: stored });
  await SecureStore.deleteItemAsync(KEY);
  pending = null;
  // Scheduled morning numbers and alerts carry figures from the deleted data.
  await cancelAllNotifications();
  await wipeLocalDb();
}
