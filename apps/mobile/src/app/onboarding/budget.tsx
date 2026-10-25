import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, Skeleton, StepScreen, Text, useSalaryForm } from '@/components';
import { setSalary } from '@/data/db';
import { loadHistory } from '@/data/ingest';
import { proposeBudget, type BudgetProposal } from '@/domain/detect';
import { track } from '@/lib/device';
import { ordinal, plural } from '@/lib/format';
import { space } from '@/theme/tokens';

const monthLabel = (m: string) => new Date(`${m}-15T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export default function Budget() {
  const history = useQuery({ queryKey: ['history'], queryFn: loadHistory });
  const proposal = history.data ? proposeBudget(history.data.txns, history.data.recurring, new Date()) : undefined;
  const [editRequested, setEditing] = useState(false);
  const noProposal = proposal === null;
  const editing = editRequested || noProposal;
  const form = useSalaryForm();

  // With nothing to propose, the screen asks once for take home and pay day.
  useEffect(() => {
    if (noProposal) track('salary_asked');
  }, [noProposal]);

  const edit = () => {
    if (proposal) form.prefill({ amountMinor: proposal.amountMinor, payDay: proposal.resetDay });
    setEditing(true);
  };

  const accept = async () => {
    await setSalary(proposal!.amountMinor, proposal!.resetDay, 'detected');
    track('salary_confirmed', { source: 'detected', basis: proposal!.basis });
    router.push('/onboarding/wrapped');
  };

  const save = async () => {
    const v = form.validate();
    if (!v) return;
    await setSalary(v.amountMinor, v.payDay, 'user');
    track('salary_confirmed', { source: 'user', basis: proposal?.basis ?? 'none' });
    router.push('/onboarding/wrapped');
  };

  if (!history.data) {
    return (
      <StepScreen>
        <Skeleton height={38} round={8} />
        <Skeleton height={160} round={16} />
      </StepScreen>
    );
  }

  return (
    <StepScreen
      actions={
        editing ? (
          <Button label="Save" fullWidth onPress={save} />
        ) : (
          <>
            <Button label="Looks right" fullWidth onPress={accept} />
            <Button label="Change it" variant="ghost" fullWidth onPress={edit} />
          </>
        )
      }
    >
      {proposal ? <Proposal proposal={proposal} /> : <NoHistory />}
      {editing ? form.fields : null}
    </StepScreen>
  );
}

function Proposal({ proposal }: { proposal: BudgetProposal }) {
  const salary = proposal.basis === 'salary';
  return (
    <>
      <Text variant="label" color="textSecondary">
        Your monthly budget looks like
      </Text>
      <AmountText money={{ amountMinor: proposal.amountMinor, currency: 'INR' }} size="display" />
      <Text variant="prose" color="textSecondary">
        {salary
          ? `This is the money that comes in each month, usually around the ${ordinal(proposal.resetDay)}. We found it in these credits:`
          : `We did not find a salary, so this is what you usually spend in a month: the middle of your last ${plural(proposal.lines.length, 'month')}.`}
      </Text>
      <Card style={styles.lines}>
        {proposal.lines.map((l) => (
          <View key={l.label} style={styles.line}>
            <View style={styles.grow}>
              <Text variant="body" numberOfLines={1}>
                {salary ? l.label : monthLabel(l.label)}
              </Text>
              <Text variant="caption" color="textSecondary">
                {plural(l.txnIds.length, salary ? 'credit' : 'payment')}
              </Text>
            </View>
            <AmountText money={{ amountMinor: l.amountMinor, currency: 'INR' }} />
          </View>
        ))}
      </Card>
    </>
  );
}

function NoHistory() {
  return (
    <>
      <Text variant="display" accessibilityRole="header">
        One question
      </Text>
      <Text variant="prose" color="textSecondary">
        We could not find a salary or a full month of spending in your messages yet. Tell us what you take home and we will use that until
        we can see it ourselves.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  lines: { gap: space.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  grow: { flex: 1, minWidth: 0 },
});
