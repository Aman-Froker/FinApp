import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { PermissionsAndroid, Platform } from 'react-native';

import { Button, StepScreen, Text } from '@/components';
import { setSetting } from '@/data/db';
import { refreshAll } from '@/data/refresh';
import { track } from '@/lib/device';

// Android 13 (API 33) added a runtime permission for notifications; older versions allow them by default.
const needsAsking = Platform.OS === 'android' && Number(Platform.Version) >= 33;

export default function Notify() {
  const queryClient = useQueryClient();

  const finish = async (wanted: boolean) => {
    const result = wanted && needsAsking ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) : null;
    const on = wanted && (result === null || result === 'granted');
    track(on ? 'notifications_enabled' : 'notifications_declined', { result: result ?? 'not_asked' });
    await setSetting('notify.morning', on ? 'yes' : 'no');
    await setSetting('onboarding.at', new Date().toISOString());
    await setSetting('onboarding.done', 'yes');
    // Schedules the first morning numbers and alerts.
    await refreshAll().catch(() => false);
    // Set, not invalidated: home is unmounted, so a refetch would first show the stale "not done".
    queryClient.setQueryData(['onboarding'], true);
    router.dismissAll();
    router.replace('/');
  };

  return (
    <StepScreen
      actions={
        <>
          <Button label="Turn on" fullWidth onPress={() => finish(true)} />
          <Button label="Not now" variant="ghost" fullWidth onPress={() => finish(false)} />
        </>
      }
    >
      <Text variant="display" accessibilityRole="header">
        One number every morning
      </Text>
      <Text variant="prose" color="textSecondary">
        At 8 AM we send what you can safely spend that day, worked out from your salary, your regular payments and what you have spent so far.
      </Text>
      <Text variant="prose" color="textSecondary">
        You can turn it off at any time.
      </Text>
    </StepScreen>
  );
}
