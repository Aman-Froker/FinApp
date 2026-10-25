import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { SmsInbox } from '../../modules/sms-inbox';
import { Button, EmptyState, ScreenHeader, StepScreen, Text } from '@/components';
import { markAsk } from '@/data/journey';
import { track } from '@/lib/device';

export default function NotificationAccess() {
  const queryClient = useQueryClient();
  // Android has no prompt for this: the user turns it on in settings and comes back, so the screen
  // checks every second until it is on (a cheap local call).
  const access = useQuery({
    queryKey: ['notification-access'],
    queryFn: () => !!SmsInbox?.hasNotificationAccess(),
    refetchInterval: (q) => (q.state.data ? false : 1000),
  });
  const on = access.data === true;

  useEffect(() => {
    if (!on) return;
    track('ask_accepted', { type: 'notification_access' });
    markAsk('notification_access', 'accepted').catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['ask'] });
  }, [on, queryClient]);

  if (on) {
    return (
      <StepScreen actions={<Button label="Done" fullWidth onPress={() => router.back()} />}>
        <ScreenHeader title="Shop names" />
        <EmptyState icon="check" title="Turned on" body="Your next UPI payments will show the shop name. You can turn this off in Android settings at any time." />
      </StepScreen>
    );
  }
  return (
    <StepScreen actions={<Button label="Open settings" icon="settings" fullWidth onPress={() => SmsInbox?.openNotificationAccess()} />}>
      <ScreenHeader title="Shop names" />
      <Text variant="prose" color="textSecondary">
        {"When you pay by UPI, your bank's message often shows only a UPI ID. Google Pay, PhonePe, Paytm and CRED show the shop's name in their payment notification."}
      </Text>
      <Text variant="prose" color="textSecondary">
        With notification access, Fin App reads only payment notifications from those four apps, takes the shop name and amount, and ignores
        everything else. Nothing is sent anywhere.
      </Text>
      <Text variant="caption" color="textSecondary">
        In settings, turn on Fin App merchant names. If Android says the setting is restricted, open App info for Fin App, tap the menu at
        the top and choose Allow restricted settings, then try again.
      </Text>
    </StepScreen>
  );
}
