import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Chip, ScreenHeader, Skeleton, StepScreen, Text, TextField } from '@/components';
import { getGoal, setGoal, type GoalRow } from '@/data/db';
import { markAsk } from '@/data/journey';
import { refreshAll } from '@/data/refresh';
import { monthlySetAside } from '@/domain/goal';
import { track } from '@/lib/device';
import { asRupees, formatMoney, parseRupees } from '@/lib/format';
import { space } from '@/theme/tokens';

const HORIZONS = [3, 6, 12, 24];
const horizonLabel = (m: number) => (m < 12 ? `In ${m} months` : m === 12 ? 'In a year' : `In ${m / 12} years`);
const monthsAhead = (m: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + m, d.getDate()).toISOString();
};

export default function GoalScreen() {
  const saved = useQuery({ queryKey: ['goal'], queryFn: getGoal });
  if (saved.isPending) {
    return (
      <StepScreen>
        <ScreenHeader title="Your goal" />
        <Skeleton height={240} round={16} />
      </StepScreen>
    );
  }
  return <Form initial={saved.data ?? null} />;
}

// Mounted once any saved goal is loaded, so the fields start filled in.
function Form({ initial }: { initial: GoalRow | null }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial ? asRupees(initial.amountMinor) : '');
  const [months, setMonths] = useState<number | null>(initial ? null : 6);
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});
  const amountMinor = parseRupees(amount);
  const targetDate = months ? monthsAhead(months) : (initial?.targetDate ?? monthsAhead(6));
  const monthly = amountMinor ? monthlySetAside({ name, amountMinor, targetDate }, new Date()) : null;

  const done = async () => {
    await Promise.all(['goal', 'money', 'ask'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
    refreshAll().catch(() => false);
    router.back();
  };

  const save = async () => {
    const next = { name: name.trim() ? undefined : 'Give your goal a name', amount: amountMinor ? undefined : 'Enter the amount in rupees, for example 50000' };
    setErrors(next);
    if (next.name || next.amount) return;
    await setGoal({ name: name.trim(), amountMinor: amountMinor!, targetDate });
    if (!initial) {
      await markAsk('goal', 'accepted');
      track('ask_accepted', { type: 'goal' });
    }
    await done();
  };

  const remove = () =>
    Alert.alert('Remove this goal?', 'Its monthly amount will no longer be set aside from your daily number.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await setGoal(null);
          await done();
        },
      },
    ]);

  return (
    <StepScreen
      actions={
        <>
          <Button label="Save goal" fullWidth onPress={save} />
          {initial ? <Button label="Remove goal" variant="ghost" fullWidth onPress={remove} /> : null}
        </>
      }
    >
      <ScreenHeader title="Your goal" />
      <TextField label="What are you saving for?" placeholder="For example, Goa trip" value={name} onChangeText={setName} maxLength={40} error={errors.name} />
      <TextField label="How much, in rupees" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={errors.amount} />
      <View style={styles.horizon}>
        <Text variant="label" color="textSecondary">
          By when
        </Text>
        <View style={styles.chips}>
          {HORIZONS.map((m) => (
            <Chip key={m} label={horizonLabel(m)} selected={months === m} onPress={() => setMonths(m)} />
          ))}
        </View>
        {!months && initial ? (
          <Text variant="caption" color="textSecondary">
            {`Currently ${new Date(initial.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
          </Text>
        ) : null}
      </View>
      {monthly ? (
        <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
          {`${formatMoney({ amountMinor: monthly, currency: 'INR' })} a month will be set aside before your daily number.`}
        </Text>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  horizon: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
