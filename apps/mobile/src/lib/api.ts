import { apiErrorSchema, type TokenPair } from '@finapp/shared';
import Constants from 'expo-constants';

import { tokenStore } from './storage';

// In development the API runs on the same machine as Metro, so its host is reused.
// This works for the iOS simulator, the Android emulator and a phone on the same network.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (devHost ? `http://${devHost}:3000` : 'http://localhost:3000');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: (() => void) | null) => {
  onSignedOut = fn;
};

// One refresh in flight at a time; concurrent 401s share it.
let refreshing: Promise<TokenPair | null> | null = null;
function refreshTokens(): Promise<TokenPair | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const current = await tokenStore.get();
      if (!current) return null;
      const res = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        await tokenStore.clear();
        onSignedOut?.();
        return null;
      }
      const { tokens } = (await res.json()) as { tokens: TokenPair };
      await tokenStore.set(tokens);
      return tokens;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// `token` sends a specific bearer (the anonymous device token) and skips the user refresh flow.
type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; auth?: boolean; token?: string };

export async function api<T>(path: string, { method = 'GET', body, auth = true, token }: Options = {}): Promise<T> {
  if (token) auth = false;
  const send = (accessToken?: string) =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await send(token ?? (auth ? (await tokenStore.get())?.accessToken : undefined));
  if (res.status === 401 && auth) {
    const fresh = await refreshTokens();
    if (fresh) res = await send(fresh.accessToken);
  }
  if (res.status === 204) return undefined as T;

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    const e = parsed.success
      ? parsed.data.error
      : { code: 'http_error', message: `Request failed (${res.status})`, details: undefined };
    throw new ApiError(res.status, e.code, e.message, e.details);
  }
  return json as T;
}
