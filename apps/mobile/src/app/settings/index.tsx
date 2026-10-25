import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, PermissionsAndroid, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AmountText, Button, Card, Icon, Rule, ScreenHeader, StepScreen, Text } from '@/components';
import { getSalary, getSetting, setSetting } from '@/data/db';
import { localStats } from '@/data/ingest';
import { refreshAll } from '@/data/refresh';
import { deleteAllData, track } from '@/lib/device';
import { ordinal } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const needsAsking = Platform.OS === 'android' && Number(Platform.Version) >= 33;

export default function Settings() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const salary = useQuery({ queryKey: ['salary'], queryFn: getSalary });
  const morning = useQuery({ queryKey: ['notify-morning'], queryFn: async () => (await getSetting('notify.morning')) === 'yes' });
  const stats = useQuery({ queryKey: ['stats'], queryFn: localStats });

  const setMorning = async (on: boolean) => {
    if (on && needsAsking && (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) !== 'granted') {
      Alert.alert('Notifications are off', 'Turn on notifications for Fin App in Android settings to get the morning number.');
      return;
    }
    await setSetting('notify.morning', on ? 'yes' : 'no');
    track(on ? 'notifications_enabled' : 'notifications_declined', { from: 'settings' });
    await queryClient.invalidateQueries({ queryKey: ['notify-morning'] });
    refreshAll().catch(() => false);
  };

  const confirmDelete = () =>
    Alert.alert('Delete all data?', 'This removes everything Fin App stored on this phone and on our server. Your messages stay in your SMS app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            track('delete_requested');
            const result = await deleteAllData();
            if (result === 'server_pending') {
              Alert.alert('Deleted from this phone', 'We could not reach our server just now. Its copy will be deleted as soon as you are back online.');
            }
            queryClient.clear();
            queryClient.setQueryData(['onboarding'], false);
            router.dismissAll();
            router.replace('/onboarding');
          } catch {
            Alert.alert('Something went wrong', 'Nothing was deleted. Please try again.');
          }
        },
      },
    ]);

  const s = stats.data;
  return (
    <StepScreen>
      <ScreenHeader title="Settings" />
      <Card>
        <Pressable onPress={() => router.push('/settings/budget')} accessibilityRole="button" accessibilityHint="Change your monthly budget and pay day" style={styles.row}>
          <View style={styles.grow}>
            <Text variant="body">Monthly budget</Text>
            {salary.data ? (
              <Text variant="caption" color="textSecondary">
                {`Starts again on the ${ordinal(salary.data.payDay)}`}
              </Text>
            ) : null}
          </View>
          {salary.data ? <AmountText money={{ amountMinor: salary.data.amountMinor, currency: 'INR' }} /> : null}
          <Icon name="chevron" color="textSecondary" />
        </Pressable>
        <Rule />
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text variant="body">Morning number</Text>
            <Text variant="caption" color="textSecondary">
              What is safe to spend, every day at 8 AM
            </Text>
          </View>
          <Switch
            value={!!morning.data}
            onValueChange={setMorning}
            trackColor={{ true: colors.accent, false: colors.rule }}
            thumbColor={colors.surface}
            accessibilityLabel="Morning number at 8 AM"
          />
        </View>
      </Card>

      <Card>
        <Pressable onPress={() => router.push('/cards')} accessibilityRole="button" accessibilityHint="Shows your cards and what is due" style={styles.row}>
          <Text variant="body" style={styles.grow}>
            Your cards
          </Text>
          <Icon name="chevron" color="textSecondary" />
        </Pressable>
      </Card>

      <Card>
        <Text variant="label" color="textSecondary">
          Where your data comes from
        </Text>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text variant="body">Bank and UPI messages</Text>
            <Text variant="caption" color="textSecondary">
              {s
                ? `${s.financial.toLocaleString('en-IN')} read, ${s.financial ? Math.round((100 * s.parsed) / s.financial) : 0}% understood`
                : ' '}
            </Text>
          </View>
        </View>
        <Rule />
        <Pressable onPress={() => router.push('/settings/email')} accessibilityRole="button" accessibilityHint="Set up forwarding of bank emails" style={styles.row}>
          <View style={styles.grow}>
            <Text variant="body">Bank emails</Text>
            <Text variant="caption" color="textSecondary">
              Forward alerts and card statements from Gmail
            </Text>
          </View>
          <Icon name="chevron" color="textSecondary" />
        </Pressable>
      </Card>

      <Button variant="ghost" label="Delete all data" onPress={confirmDelete} />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  grow: { flex: 1, minWidth: 0, gap: space.xxs },
});
