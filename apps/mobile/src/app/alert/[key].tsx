import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, EmptyState, ScreenHeader, Skeleton, StepScreen, Text, TransactionRow } from '@/components';
import { getDb } from '@/data/db';
import { loadMoney } from '@/data/refresh';
import { payeeOf } from '@/domain/detect';

type AlertRow = { key: string; title: string; body: string; fireAt: string; txnIds: string };

export default function AlertDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const alert = useQuery({
    queryKey: ['alert', key],
    queryFn: async () => (await getDb()).getFirstAsync<AlertRow>('SELECT key, title, body, fireAt, txnIds FROM alerts WHERE key = ?', key),
  });
  const money = useQuery({ queryKey: ['money'], queryFn: () => loadMoney() });
  const a = alert.data;
  const ids = a ? (JSON.parse(a.txnIds) as string[]) : [];
  const txns = (money.data?.txns ?? []).filter((t) => ids.includes(t.id));

  if (alert.isPending) {
    return (
      <StepScreen>
        <ScreenHeader title="Alert" />
        <Skeleton height={160} round={16} />
      </StepScreen>
    );
  }
  if (!a) {
    return (
      <StepScreen>
        <ScreenHeader title="Alert" />
        <EmptyState icon="check" title="Nothing to do" body="This alert is no longer active." />
      </StepScreen>
    );
  }
  return (
    <StepScreen>
      <ScreenHeader title="Alert" />
      <Text variant="title">{a.title}</Text>
      <Text variant="prose" color="textSecondary">
        {a.body}
      </Text>
      {txns.length ? (
        <Card>
          <Text variant="label" color="textSecondary">
            Based on
          </Text>
          {txns.map((t) => (
            <TransactionRow
              key={t.id}
              merchant={payeeOf(t)}
              date={new Date(t.date)}
              money={{ amountMinor: t.direction === 'debit' ? -t.amountMinor : t.amountMinor, currency: 'INR' }}
              onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: t.id } })}
            />
          ))}
        </Card>
      ) : null}
    </StepScreen>
  );
}
