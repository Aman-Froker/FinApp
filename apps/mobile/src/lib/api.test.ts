import { api } from './api';
import { tokenStore } from './storage';

const mockMemory = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockMemory.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMemory.set(k, v),
  deleteItemAsync: async (k: string) => void mockMemory.delete(k),
}));

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

test('refreshes once for concurrent 401s and retries with the new token', async () => {
  await tokenStore.set({ accessToken: 'old', refreshToken: 'r1' });
  const calls: { url: string; auth?: string }[] = [];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>)?.authorization;
    calls.push({ url, auth });
    if (url.endsWith('/v1/auth/refresh')) {
      return json(200, { tokens: { accessToken: 'new', refreshToken: 'r2', expiresIn: 900 } });
    }
    if (auth === 'Bearer old') return json(401, { error: { code: 'invalid_token', message: 'expired' } });
    return json(200, { ok: true, url });
  }) as unknown as typeof fetch;

  const [a, b] = await Promise.all([api<{ url: string }>('/v1/a'), api<{ url: string }>('/v1/b')]);
  expect(a.url).toBe('http://localhost:3000/v1/a');
  expect(b.url).toBe('http://localhost:3000/v1/b');
  expect(calls.filter((c) => c.url.endsWith('/refresh'))).toHaveLength(1);
  expect(await tokenStore.get()).toEqual({ accessToken: 'new', refreshToken: 'r2' });
});

test('surfaces the API error shape', async () => {
  globalThis.fetch = jest.fn(async () =>
    json(409, { error: { code: 'email_taken', message: 'Taken' } }),
  ) as unknown as typeof fetch;
  await expect(api('/v1/auth/sign-up', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({
    status: 409,
    code: 'email_taken',
    message: 'Taken',
  });
});
