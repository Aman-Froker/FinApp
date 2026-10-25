import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, EmptyState, ScreenHeader, Skeleton, StepScreen, Text } from '@/components';
import { editTransaction, transactionDetail, type TxnEdit } from '@/data/ingest';
import { refreshAll } from '@/data/refresh';
import { track } from '@/lib/device';
import { space } from '@/theme/tokens';

const HOW_IT_COUNTS: Record<string, string> = {
  spend: 'Counts as spending.',
  fee: 'Counts as spending: a bank or card charge.',
  income: 'Counts as money in.',
  refund: 'A refund: takes off what you have spent.',
  transfer: 'A transfer between your own accounts or to a card bill: not spending.',
};
const timeOf = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['txn', id], queryFn: () => transactionDetail(id) });
  const t = detail.data;

  const edit = async (e: TxnEdit) => {
    await editTransaction(id, e);
    track('transaction_edited', { field: e.field, value: String(e.value) });
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['txn', id] }), queryClient.invalidateQueries({ queryKey: ['money'] })]);
    refreshAll().catch(() => false);
  };

  if (detail.isPending) {
    return (
      <StepScreen>
        <ScreenHeader title="Transaction" />
        <Skeleton height={240} round={16} />
      </StepScreen>
    );
  }
  if (!t) {
    return (
      <StepScreen>
        <ScreenHeader title="Transaction" />
        <EmptyState icon="warning" title="Transaction not found" body="It may have been removed when your data was deleted." />
      </StepScreen>
    );
  }
  const debit = t.direction === 'debit';
  const name = t.counterparty ?? t.counterpartyVpa ?? 'Unknown payee';

  return (
    <StepScreen>
      <ScreenHeader title={name} />
      <Card>
        <AmountText money={{ amountMinor: debit ? -t.amountMinor : t.amountMinor, currency: 'INR' }} size="display" />
        <Text variant="body" color="textSecondary">
          {[timeOf(t.date), t.accountLast4 ? `Account ending ${t.accountLast4}` : null, t.instrument.toUpperCase()].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="body">{HOW_IT_COUNTS[t.kind]}</Text>
        {t.status === 'failed' ? (
          <Text variant="body" color="textSecondary">
            The bank marked this payment as failed.
          </Text>
        ) : null}
        {t.source === 'user' ? (
          <Text variant="caption" color="textSecondary">
            You changed how this counts.
          </Text>
        ) : null}
      </Card>

      <View style={styles.actions}>
        {t.kind === 'transfer' ? (
          <Button variant="secondary" fullWidth label={debit ? 'Count this as spending' : 'Count this as money in'} onPress={() => edit({ field: 'kind', value: debit ? 'spend' : 'income' })} />
        ) : (
          <Button variant="secondary" fullWidth label="This was a transfer, not spending" onPress={() => edit({ field: 'kind', value: 'transfer' })} />
        )}
        {debit ? (
          <Button
            variant="secondary"
            fullWidth
            label={t.refundExpected ? 'Refund no longer expected' : 'I am expecting a refund'}
            accessibilityHint="We remind you if the money has not come back after 3 days"
            onPress={() => edit({ field: 'refundExpected', value: !t.refundExpected })}
          />
        ) : null}
      </View>

      {t.rule === 'email' ? (
        <Text variant="caption" color="textSecondary">
          From a forwarded bank email
        </Text>
      ) : null}
      {t.body ? (
        <View style={styles.source}>
          <Text variant="label" color="textSecondary">
            {`From the message by ${t.sender}`}
          </Text>
          <Text variant="body" color="textSecondary" selectable>
            {t.body}
          </Text>
        </View>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm },
  source: { gap: space.xs },
});
