import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, Icon, Rule, ScreenHeader, Skeleton, StepScreen, Text } from '@/components';
import { setSetting } from '@/data/db';
import { excludedKeys, loadMoney, refreshAll } from '@/data/refresh';
import { track } from '@/lib/device';
import { formatDate, plural } from '@/lib/format';
import { space } from '@/theme/tokens';

const day = (iso: string) => formatDate(new Date(iso));

export default function Breakdown() {
  const queryClient = useQueryClient();
  const money = useQuery({ queryKey: ['money'], queryFn: () => loadMoney() });

  // Stops or restarts counting a regular payment, for one the user has cancelled.
  const setCounted = async (key: string, counted: boolean) => {
    const excluded = await excludedKeys();
    if (counted) excluded.delete(key);
    else excluded.add(key);
    await setSetting('committed.excluded', JSON.stringify([...excluded]));
    track('line_edited', { line: 'committed', counted });
    await queryClient.invalidateQueries({ queryKey: ['money'] });
    refreshAll().catch(() => false);
  };

  const data = money.data;
  const s = data?.safe;
  if (!data || !s) {
    return (
      <StepScreen>
        <ScreenHeader title="How it is worked out" />
        <Skeleton height={320} round={16} />
      </StepScreen>
    );
  }
  const notCounted = data.recurring.filter((r) => data.excluded.has(r.key));

  return (
    <StepScreen>
      <ScreenHeader title="How it is worked out" />
      <Card>
        <Line label="Your monthly budget" amountMinor={s.incomeMinor} onPress={() => router.push('/settings/budget')} hint="Change your monthly budget and pay day" />
        <Rule />
        <Line label="Regular payments still to come" amountMinor={-s.committedMinor} />
        {s.committed.length ? (
          s.committed.map((c) => (
            <Pressable
              key={`${c.key}${c.dueDate}`}
              style={styles.sub}
              accessibilityRole="button"
              accessibilityHint="Lets you stop counting this payment"
              onPress={() =>
                Alert.alert(`Stop counting ${c.label}?`, 'Do this if you have cancelled it. It will no longer be set aside from your budget.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Stop counting', onPress: () => setCounted(c.key, false) },
                ])
              }
            >
              <View style={styles.grow}>
                <Text variant="body" numberOfLines={1}>
                  {c.label}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`Due ${day(c.dueDate)}`}
                </Text>
              </View>
              <AmountText money={{ amountMinor: c.amountMinor, currency: 'INR' }} />
              <Trailing onPress />
            </Pressable>
          ))
        ) : (
          <Text variant="caption" color="textSecondary">
            None left before your salary.
          </Text>
        )}
        {data.goal ? (
          <>
            <Rule />
            <Line label={`Set aside for ${data.goal.name}`} amountMinor={-s.goalMinor} onPress={() => router.push('/goal')} hint="Change or remove your goal" />
          </>
        ) : null}
        <Rule />
        <Line label={`Spent since ${day(s.cycleStart)}`} amountMinor={-s.spentMinor} onPress={() => router.push('/transactions')} hint="Shows your transactions" />
        <Rule />
        <Line label="Left for this month" amountMinor={s.remainingMinor} strong />
        <View style={styles.line}>
          <Text variant="body" style={styles.grow}>
            Days until your salary
          </Text>
          <Text variant="bodyStrong" tabular>
            {String(s.daysLeft)}
          </Text>
          <Trailing />
        </View>
        <Rule />
        <Line label="Safe to spend today" amountMinor={s.safeTodayMinor} strong />
      </Card>
      <Text variant="body" color="textSecondary">
        {`What is left for the month, shared over the ${plural(s.daysLeft, 'day')} until your salary on ${day(s.nextSalary)}. Card spends count on the day you swipe, so the card bill is not counted again.`}
      </Text>
      {notCounted.length ? (
        <Card>
          <Text variant="label" color="textSecondary">
            Not counted
          </Text>
          {notCounted.map((r) => (
            <View key={r.key} style={styles.sub}>
              <Text variant="body" numberOfLines={1} style={styles.grow}>
                {r.label}
              </Text>
              <Button variant="ghost" label="Count again" onPress={() => setCounted(r.key, true)} />
            </View>
          ))}
        </Card>
      ) : null}
    </StepScreen>
  );
}

type LineProps = { label: string; amountMinor: number; strong?: boolean; onPress?: () => void; hint?: string };

function Line({ label, amountMinor, strong, onPress, hint }: LineProps) {
  return (
    <Pressable style={styles.line} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityHint={hint}>
      <Text variant={strong ? 'bodyStrong' : 'body'} style={styles.grow}>
        {label}
      </Text>
      <AmountText money={{ amountMinor, currency: 'INR' }} />
      <Trailing onPress={!!onPress} />
    </Pressable>
  );
}

// Same width on every row, so the amounts line up whether or not the row opens something.
const Trailing = ({ onPress }: { onPress?: boolean }) => <View style={styles.trailing}>{onPress ? <Icon name="chevron" size={20} color="textSecondary" /> : null}</View>;

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingLeft: space.md },
  grow: { flex: 1, minWidth: 0 },
  trailing: { width: 20 },
});
