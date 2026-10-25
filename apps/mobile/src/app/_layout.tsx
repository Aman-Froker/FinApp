import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth';
import { retryServerDelete } from '@/lib/device';
import { setUpNotifications } from '@/lib/notify';
import { Sentry, sentryEnabled } from '@/lib/sentry';
import { fonts } from '@/theme/fonts';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded, error] = useFonts(fonts);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <Navigator />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function Navigator() {
  const { colors, scheme } = useTheme();
  const { status } = useAuth();
  const reduced = useReducedMotion();
  const tapped = Notifications.useLastNotificationResponse();

  useEffect(() => {
    setUpNotifications().catch(() => undefined);
    // Finishes a delete-all that was made offline.
    retryServerDelete().catch(() => false);
  }, []);

  // A tapped notification opens what it is about: home for the morning number, the alert otherwise.
  useEffect(() => {
    const url = tapped?.notification.request.content.data?.url;
    if (typeof url === 'string' && url !== '/') router.push(url as never);
  }, [tapped]);

  if (status === 'loading') return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduced ? 'fade' : 'default',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}

export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;
