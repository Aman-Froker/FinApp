import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, Skeleton, StepScreen, Text, useSalaryForm } from '@/components';
import { setSalary } from '@/data/db';
import { loadHistory } from '@/data/ingest';
import { detectSalary, proposeBudget, salaryChoices, type BudgetProposal, type Salary } from '@/domain/detect';
import { track } from '@/lib/device';
import { formatDate, ordinal, plural } from '@/lib/format';
import { space } from '@/theme/tokens';

const monthLabel = (m: string) => new Date(`${m}-15T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export default function Budget() {
  const history = useQuery({ queryKey: ['history'], queryFn: loadHistory });
  // undefined until answered, null for "None of these".
  const [picked, setPicked] = useState<Salary | null>();
  const now = new Date();
  const detected = history.data ? detectSalary(history.data.txns, history.data.recurring, now) : null;
  const choices = history.data && !detected?.sure ? salaryChoices(history.data.txns, history.data.recurring, now) : [];
  const asking = choices.length > 0 && picked === undefined;
  const salary = detected?.sure ? detected : (picked ?? null);
  const proposal = history.data ? proposeBudget(history.data.txns, history.data.recurring, now, salary) : undefined;
  const [editRequested, setEditing] = useState(false);
  const noProposal = proposal === null;
  const editing = editRequested || noProposal;
  const form = useSalaryForm();

  // With nothing to propose, the screen asks once for take home and pay day.
  useEffect(() => {
    if (noProposal && !asking) track('salary_asked');
  }, [noProposal, asking]);

  const pick = (choice: Salary | null) => {
    track('salary_picked', { picked: choice ? 'one' : 'none', choices: choices.length });
    setPicked(choice);
  };

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

  if (asking) {
    return (
      <StepScreen actions={<Button label="None of these" variant="ghost" fullWidth onPress={() => pick(null)} />}>
        <Choices choices={choices} onPick={pick} />
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

function Choices({ choices, onPick }: { choices: Salary[]; onPick: (s: Salary) => void }) {
  return (
    <>
      <Text variant="display" accessibilityRole="header">
        Which of these is your salary?
      </Text>
      <Text variant="prose" color="textSecondary">
        Your biggest credits change from month to month, so we are not sure which one is your pay. Tap the one that is.
      </Text>
      <Card style={styles.lines}>
        {choices.map((c) => {
          const when = c.txnIds.length > 1 ? `${plural(c.txnIds.length, 'credit')}, around the ${ordinal(c.payDay)}` : `Once, on ${formatDate(new Date(c.lastSeen))}`;
          return (
            <Pressable
              key={c.key}
              onPress={() => onPick(c)}
              accessibilityRole="button"
              accessibilityLabel={`${c.label}, ${when}`}
              style={({ pressed }) => [styles.line, pressed && styles.pressed]}
            >
              <View style={styles.grow}>
                <Text variant="body" numberOfLines={1}>
                  {c.label}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {when}
                </Text>
              </View>
              <AmountText money={{ amountMinor: c.amountMinor, currency: 'INR' }} />
            </Pressable>
          );
        })}
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
  pressed: { opacity: 0.8 },
});
