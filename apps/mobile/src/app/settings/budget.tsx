import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { Button, ScreenHeader, Skeleton, StepScreen, Text, useSalaryForm, type SalaryValue } from '@/components';
import { getSalary, setSalary } from '@/data/db';
import { refreshAll } from '@/data/refresh';
import { track } from '@/lib/device';

export default function EditBudget() {
  const salary = useQuery({ queryKey: ['salary'], queryFn: getSalary });
  if (salary.isPending) {
    return (
      <StepScreen>
        <ScreenHeader title="Monthly budget" />
        <Skeleton height={160} round={16} />
      </StepScreen>
    );
  }
  return <Form initial={salary.data ?? null} />;
}

// Mounted once the saved values are known, so the fields start filled in.
function Form({ initial }: { initial: SalaryValue | null }) {
  const queryClient = useQueryClient();
  const form = useSalaryForm(initial);
  const save = async () => {
    const v = form.validate();
    if (!v) return;
    await setSalary(v.amountMinor, v.payDay, 'user');
    track('line_edited', { line: 'income' });
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['salary'] }), queryClient.invalidateQueries({ queryKey: ['money'] })]);
    refreshAll().catch(() => false);
    router.back();
  };
  return (
    <StepScreen actions={<Button label="Save" fullWidth onPress={save} />}>
      <ScreenHeader title="Monthly budget" />
      <Text variant="body" color="textSecondary">
        What you take home each month and the day it arrives. Your daily number is worked out from this.
      </Text>
      {form.fields}
    </StepScreen>
  );
}
