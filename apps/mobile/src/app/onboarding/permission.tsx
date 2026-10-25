import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid } from 'react-native';

import { SmsInbox } from '../../../modules/sms-inbox';
import { Button, StepScreen, Text } from '@/components';
import { setSetting } from '@/data/db';
import { track } from '@/lib/device';

export default function Permission() {
  const queryClient = useQueryClient();
  const [blocked, setBlocked] = useState(false);
  const [denied, setDenied] = useState(false);

  const granted = useCallback(async () => {
    await setSetting('sms.consent', 'yes');
    await queryClient.invalidateQueries({ queryKey: ['sms-consent'] });
    router.replace('/onboarding/scan');
  }, [queryClient]);

  // Coming back from system settings with access now turned on continues without another tap.
  useEffect(() => {
    if (!blocked) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && SmsInbox?.hasPermission()) void granted();
    });
    return () => sub.remove();
  }, [blocked, granted]);

  const ask = async () => {
    track('permission_sms_prompted');
    // Reading the inbox and hearing about new messages are one prompt on Android (the SMS group).
    const results = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.READ_SMS, PermissionsAndroid.PERMISSIONS.RECEIVE_SMS]);
    const result = results[PermissionsAndroid.PERMISSIONS.READ_SMS];
    track(result === 'granted' ? 'permission_sms_granted' : 'permission_sms_denied', { result, receive: results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] });
    if (result === 'granted') await granted();
    else {
      setDenied(true);
      setBlocked(result === 'never_ask_again');
    }
  };

  return (
    <StepScreen
      actions={
        blocked ? (
          <Button label="Open settings" icon="settings" fullWidth onPress={() => Linking.openSettings()} />
        ) : (
          <Button label="Allow SMS access" fullWidth onPress={ask} />
        )
      }
    >
      <Text variant="display" accessibilityRole="header">
        Read your bank messages
      </Text>
      <Text variant="prose" color="textSecondary">
        We look only at messages from banks, cards and UPI apps. Personal messages and OTPs are skipped on your phone and never leave it.
      </Text>
      <Text variant="prose" color="textSecondary">
        We read the last 12 months to learn your salary, your regular payments and where your money goes.
      </Text>
      {denied ? (
        <Text variant="body" color="warning" accessibilityLiveRegion="polite">
          {blocked
            ? 'SMS access is turned off for Fin App. Turn it on under Permissions in settings, then come back.'
            : 'Fin App cannot show anything without reading bank messages. You can allow it whenever you are ready.'}
        </Text>
      ) : null}
    </StepScreen>
  );
}
