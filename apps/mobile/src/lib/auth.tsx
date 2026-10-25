import type { AuthResponse, User } from '@finapp/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setSignedOutHandler } from './api';
import { tokenStore } from './storage';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type Auth = {
  status: AuthStatus;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const queryClient = useQueryClient();

  useEffect(() => {
    tokenStore.get().then((t) => setStatus(t ? 'signedIn' : 'signedOut'));
    setSignedOutHandler(() => {
      queryClient.clear();
      setStatus('signedOut');
    });
    return () => setSignedOutHandler(null);
  }, [queryClient]);

  const value = useMemo<Auth>(() => {
    const accept = async (r: AuthResponse) => {
      await tokenStore.set(r.tokens);
      queryClient.setQueryData(['me'], r.user);
      setStatus('signedIn');
    };
    return {
      status,
      signUp: async (email, password) =>
        accept(await api<AuthResponse>('/v1/auth/sign-up', { method: 'POST', body: { email, password }, auth: false })),
      signIn: async (email, password) =>
        accept(await api<AuthResponse>('/v1/auth/sign-in', { method: 'POST', body: { email, password }, auth: false })),
      signOut: async () => {
        const tokens = await tokenStore.get();
        await tokenStore.clear();
        queryClient.clear();
        setStatus('signedOut');
        if (tokens) {
          // Best effort: the local session is already gone.
          api('/v1/auth/sign-out', { method: 'POST', body: { refreshToken: tokens.refreshToken }, auth: false }).catch(
            () => undefined,
          );
        }
      },
    };
  }, [status, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useMe() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api<{ user: User }>('/v1/me')).user,
    enabled: status === 'signedIn',
  });
}
