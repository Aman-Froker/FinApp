import type { DeviceResponse } from '@finapp/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { api, ApiError } from './api';
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

const PENDING_DELETE = 'finapp.pendingServerDelete';

// The phone is wiped at once, online or not. The server copy is deleted now if it can be reached;
// otherwise its token is kept aside and the deletion retried on every launch until it goes through.
export async function deleteAllData(): Promise<'done' | 'server_pending'> {
  const stored = await SecureStore.getItemAsync(KEY);
  // Scheduled morning numbers and alerts carry figures from the deleted data.
  await cancelAllNotifications();
  await wipeLocalDb();
  await SecureStore.deleteItemAsync(KEY);
  pending = null;
  if (!stored) return 'done';
  await SecureStore.setItemAsync(PENDING_DELETE, stored);
  return (await retryServerDelete()) ? 'done' : 'server_pending';
}

// True once the server holds nothing for the old device. A 401 means it is already gone.
export async function retryServerDelete(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(PENDING_DELETE);
  if (!token) return true;
  try {
    await api('/v1/devices/me', { method: 'DELETE', token });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) return false;
  }
  await SecureStore.deleteItemAsync(PENDING_DELETE);
  return true;
}
