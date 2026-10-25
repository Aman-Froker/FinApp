import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import { Button, StepScreen, Text } from '@/components';
import { setSetting } from '@/data/db';
import { refreshAll } from '@/data/refresh';
import { track } from '@/lib/device';

// Android 13 (API 33) added a runtime permission for notifications; older versions allow them by default.
const needsAsking = Platform.OS === 'android' && Number(Platform.Version) >= 33;

export default function Notify() {
  const queryClient = useQueryClient();
  // Android answered no to "Turn on": say so rather than carry on as if the morning number were set.
  const [refused, setRefused] = useState(false);

  const turnOn = async () => {
    const result = needsAsking ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) : 'granted';
    if (result === 'granted') return finish(true);
    track('notifications_declined', { result });
    setRefused(true);
  };

  const finish = async (on: boolean) => {
    if (on) track('notifications_enabled', { result: 'granted' });
    else if (!refused) track('notifications_declined', { result: 'not_now' });
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

  if (refused) {
    return (
      <StepScreen
        actions={
          <>
            <Button label="Open Android settings" icon="settings" fullWidth onPress={() => Linking.openSettings()} />
            <Button label="Continue without it" variant="ghost" fullWidth onPress={() => finish(false)} />
          </>
        }
      >
        <Text variant="display" accessibilityRole="header">
          Notifications are off
        </Text>
        <Text variant="prose" color="textSecondary">
          Android is not letting Fin App send notifications, so the 8 AM number cannot arrive. Turn them on under Notifications in Android
          settings, or carry on and turn them on later from Fin App&apos;s settings.
        </Text>
      </StepScreen>
    );
  }

  return (
    <StepScreen
      actions={
        <>
          <Button label="Turn on" fullWidth onPress={turnOn} />
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
