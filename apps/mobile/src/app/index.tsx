import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SmsInbox } from '../../modules/sms-inbox';
import { AmountText, AskCard, Button, Card, EmptyState, IconButton, Skeleton, Text, TransactionRow } from '@/components';
import { getSetting } from '@/data/db';
import { sundayState, type SundayState } from '@/data/game';
import { currentAsk, markAsk, recordOpen, type CurrentAsk } from '@/data/journey';
import { loadMoney, onRefreshed, refreshAll, type Money } from '@/data/refresh';
import { payeeOf, type Txn } from '@/domain/detect';
import type { SafeToSpend } from '@/domain/safeToSpend';
import { deviceToken, track } from '@/lib/device';
import { formatDate, formatMoney, plural } from '@/lib/format';
import { space } from '@/theme/tokens';

const LATEST = 5;
// Within this, the pace line says "on your usual pace" rather than naming a tiny difference.
const PACE_NOISE_MINOR = 100_00;
const inr = (amountMinor: number) => formatMoney({ amountMinor, currency: 'INR' });

export default function Home() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const supported = Platform.OS === 'android' && !!SmsInbox;
  const onboarded = useQuery({
    queryKey: ['onboarding'],
    enabled: supported,
    queryFn: async () => (await getSetting('onboarding.done')) === 'yes',
  });
  const ready = onboarded.data === true;
  // Android lets the user turn SMS access off in system settings at any time.
  const access = useQuery({ queryKey: ['sms-access'], enabled: ready, queryFn: () => !!SmsInbox?.hasPermission() });
  const money = useQuery({ queryKey: ['money'], enabled: ready, queryFn: () => loadMoney() });
  const ask = useQuery({ queryKey: ['ask', money.dataUpdatedAt], enabled: !!money.data, queryFn: () => currentAsk(money.data!) });
  const sunday = useQuery({ queryKey: ['sunday', money.dataUpdatedAt], enabled: !!money.data, queryFn: () => sundayState(money.data!) });

  useEffect(() => {
    deviceToken().catch(() => undefined);
  }, []);

  // New messages are read on open and on every return to the foreground; the SMS task covers the rest.
  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['sms-access'] });
      refreshAll().catch(() => false);
    };
    refresh();
    track('number_opened');
    recordOpen().catch(() => 0);
    const off = onRefreshed(() => void queryClient.invalidateQueries({ queryKey: ['money'] }));
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      off();
      sub.remove();
    };
  }, [ready, queryClient]);

  if (supported && onboarded.data === false) return <Redirect href="/onboarding" />;
  if (supported && onboarded.isPending) return null;

  return (
    <ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.header}>
        <Text variant="display" accessibilityRole="header">
          Fin App
        </Text>
        {supported ? <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} /> : null}
      </View>

      {!supported ? (
        <EmptyState
          icon="warning"
          title="Bank messages need Android"
          body={Platform.OS === 'android' ? 'This build cannot read SMS. Install the development build to continue.' : 'iPhone does not let apps read SMS. Email alerts arrive in a later update.'}
        />
      ) : null}

      {access.data === false ? (
        <EmptyState
          icon="warning"
          title="SMS access is off"
          body="Fin App cannot see new bank messages, so this number may be out of date. Turn SMS access back on in settings."
          action={{ label: 'Open settings', icon: 'settings', onPress: () => Linking.openSettings() }}
        />
      ) : null}

      {money.data ? money.data.safe ? <NumberCard safe={money.data.safe} /> : null : ready ? <Skeleton height={200} round={16} /> : null}
      {sunday.data ? <SundayCard state={sunday.data} /> : null}
      {ask.data ? <Ask ask={ask.data} /> : null}
      {money.data?.goal ? <GoalCard goal={money.data.goal} /> : null}
      {money.data ? <Latest txns={money.data.txns} /> : null}

      {__DEV__ ? <Button variant="ghost" label="Component gallery" onPress={() => router.push('/gallery')} /> : null}
    </ScrollView>
  );
}

function NumberCard({ safe }: { safe: SafeToSpend }) {
  const lastDay = safe.daysLeft === 1;
  const pace = safe.pace;
  return (
    <Pressable
      onPress={() => {
        track('breakdown_opened');
        router.push('/breakdown');
      }}
      accessibilityRole="button"
      accessibilityHint="Shows how this number is worked out"
    >
      <Card>
        <Text variant="label" color="textSecondary">
          {lastDay ? 'Left until your salary tomorrow' : 'Safe to spend today'}
        </Text>
        <AmountText money={{ amountMinor: lastDay ? Math.max(0, safe.remainingMinor) : safe.safeTodayMinor, currency: 'INR' }} size="display" />
        {safe.remainingMinor < 0 ? (
          <Text variant="body" color="textSecondary">
            {`${inr(-safe.remainingMinor)} over this month's budget so far.`}
          </Text>
        ) : null}
        {pace ? (
          <Text variant="body" color={pace.diffMinor >= PACE_NOISE_MINOR ? 'positive' : 'textSecondary'}>
            {Math.abs(pace.diffMinor) < PACE_NOISE_MINOR
              ? 'Right on your usual pace.'
              : pace.diffMinor > 0
                ? `${inr(pace.diffMinor)} less than you usually spend by now.`
                : `${inr(-pace.diffMinor)} more than you usually spend by now.`}
          </Text>
        ) : null}
        <Text variant="caption" color="textSecondary">
          {lastDay ? `Salary tomorrow, ${formatDate(new Date(safe.nextSalary))}.` : `Salary in ${plural(safe.daysLeft, 'day')}, on ${formatDate(new Date(safe.nextSalary))}.`}
        </Text>
      </Card>
    </Pressable>
  );
}

const ASK_COPY = {
  label_payees: (a: CurrentAsk) => ({
    unlocks: 'accurate categories',
    title: `Name ${plural(a.unknownPayees.length, 'payee')}`,
    body: `${inr(a.unknownPayees.reduce((s, p) => s + p.totalMinor, 0))} went to UPI IDs we cannot name, like ${a.unknownPayees[0]!.vpa}. Name them once and every payment to them is sorted.`,
    cta: 'Name them',
    href: '/labels' as const,
  }),
  notification_access: (a: CurrentAsk) => ({
    unlocks: 'merchant names without labelling',
    title: 'Get shop names automatically',
    body: `${Math.round((100 * a.unknownMinor) / a.spendMinor)}% of your spending (${inr(a.unknownMinor)}) has no shop name. Payment notifications from Google Pay, PhonePe, Paytm and CRED name the shop, so you never have to.`,
    cta: 'Set it up',
    href: '/notification-access' as const,
  }),
  goal: () => ({
    unlocks: 'a daily number that saves for you',
    title: 'Saving for something?',
    body: 'Add one goal and Fin App sets its share aside before working out your daily number, so you get there by the date you choose.',
    cta: 'Add a goal',
    href: '/goal' as const,
  }),
};

function Ask({ ask }: { ask: CurrentAsk }) {
  const queryClient = useQueryClient();
  const copy = ASK_COPY[ask.type as keyof typeof ASK_COPY]?.(ask);
  useEffect(() => {
    track('ask_shown', { type: ask.type });
    markAsk(ask.type, 'shown').catch(() => undefined);
  }, [ask.type, ask.trigger]);
  if (!copy) return null;
  return (
    <AskCard
      {...copy}
      onAccept={() => router.push(copy.href)}
      onDecline={async () => {
        track('ask_declined', { type: ask.type });
        await markAsk(ask.type, 'declined', ask.trigger);
        await queryClient.invalidateQueries({ queryKey: ['ask'] });
      }}
    />
  );
}

function SundayCard({ state }: { state: SundayState }) {
  if (state.game) {
    return (
      <Card>
        <Text variant="label" color="textSecondary">
          Sunday game
        </Text>
        <Text variant="heading">Guess your week</Text>
        <Text variant="body" color="textSecondary">
          {`How much did you spend on ${state.game.category.toLowerCase()} this week? It takes a minute.`}
        </Text>
        <Button label="Play" onPress={() => router.push('/sunday')} />
      </Card>
    );
  }
  if (!state.iq) return null;
  const t = state.target;
  return (
    <Card>
      <View style={styles.listHeader}>
        <Text variant="label" color="textSecondary">
          Money IQ
        </Text>
        <Text variant="caption" color="textSecondary">
          {state.streak.weeks ? `${plural(state.streak.weeks, 'Sunday')} in a row` : 'Play on Sunday to start a streak'}
        </Text>
      </View>
      <Text variant="display" tabular>{`${state.iq.score}`}</Text>
      <Text variant="body" color="textSecondary">{`Level ${state.iq.level} of 4`}</Text>
      {t ? (
        <Text variant="body">
          {`${t.category} this week: ${inr(t.spentMinor)} of your ${inr(t.predictionMinor)} target.`}
        </Text>
      ) : null}
    </Card>
  );
}

function GoalCard({ goal }: { goal: NonNullable<Money['goal']> }) {
  const by = new Date(goal.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return (
    <Pressable onPress={() => router.push('/goal')} accessibilityRole="button" accessibilityHint="Change or remove your goal">
      <Card>
        <Text variant="label" color="textSecondary">
          {`Saving for ${goal.name}`}
        </Text>
        <Text variant="body">{`${inr(goal.amountMinor)} by ${by}`}</Text>
        <Text variant="caption" color="textSecondary">
          {`${inr(goal.monthlyMinor)} a month is set aside before your daily number.`}
        </Text>
      </Card>
    </Pressable>
  );
}

function Latest({ txns }: { txns: Txn[] }) {
  const latest = txns.slice(-LATEST).reverse();
  return (
    <Card style={styles.list}>
      <View style={styles.listHeader}>
        <Text variant="heading" accessibilityRole="header">
          Latest
        </Text>
        <Button variant="ghost" label="See all" onPress={() => router.push('/transactions')} />
      </View>
      {latest.length ? (
        latest.map((t) => (
          <TransactionRow
            key={t.id}
            merchant={payeeOf(t)}
            category={t.accountLast4 ? `A/c ${t.accountLast4}` : undefined}
            date={new Date(t.date)}
            money={{ amountMinor: t.direction === 'debit' ? -t.amountMinor : t.amountMinor, currency: 'INR' }}
            onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: t.id } })}
          />
        ))
      ) : (
        <EmptyState icon="transactions" title="No transactions yet" body="Payments appear here as your bank messages arrive." />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.lg, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { paddingVertical: space.sm, gap: 0 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
