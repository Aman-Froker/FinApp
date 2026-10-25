import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const { status } = useAuth();
  const { colors } = useTheme();
  if (status === 'signedIn') return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  );
}
