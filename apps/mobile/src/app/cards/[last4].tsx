import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AmountText, Card, EmptyState, ScreenHeader, Skeleton, StepScreen, Text, TransactionRow } from '@/components';
import { loadCards } from '@/data/ingest';
import { statusOf } from '@/domain/cards';
import { formatDate, formatMoney } from '@/lib/format';
import { space } from '@/theme/tokens';

const due = (iso: string) => formatDate(new Date(`${iso}T00:00:00`));

export default function CardDetail() {
  const { last4 } = useLocalSearchParams<{ last4: string }>();
  const cards = useQuery({ queryKey: ['cards'], queryFn: loadCards });
  const card = cards.data?.find((c) => c.last4 === last4);
  const title = `Card ending ${last4}`;

  if (!cards.data) {
    return (
      <StepScreen>
        <ScreenHeader title={title} />
        <Skeleton height={200} round={16} />
      </StepScreen>
    );
  }
  if (!card) {
    return (
      <StepScreen>
        <ScreenHeader title={title} />
        <EmptyState icon="bills" title="Card not found" body="It may have been removed when your data was deleted." />
      </StepScreen>
    );
  }
  const [latest, ...earlier] = card.statements;
  return (
    <StepScreen>
      <ScreenHeader title={title} />
      {latest ? (
        <Card>
          <Text variant="label" color="textSecondary">
            {latest.paid ? 'Last statement, paid' : 'Statement due'}
          </Text>
          <AmountText money={{ amountMinor: latest.totalDueMinor, currency: 'INR' }} size="display" />
          <Text variant="body">{`Due ${due(latest.dueDate)}`}</Text>
          {latest.minDueMinor ? (
            <Text variant="body" color="textSecondary">
              {`Minimum ${formatMoney({ amountMinor: latest.minDueMinor, currency: 'INR' })}`}
            </Text>
          ) : null}
          <Text variant="caption" color="textSecondary">
            {latest.id.startsWith('email:') ? 'From a forwarded bank email' : 'From a bank message'}
          </Text>
        </Card>
      ) : (
        <Text variant="body" color="textSecondary">
          {statusOf(card)}. Forward your card statement emails to see what is due.
        </Text>
      )}

      <Text variant="heading">{latest ? 'Spent since this statement' : 'Spent on this card'}</Text>
      {card.spends.length ? (
        <Card style={styles.list}>
          {card.spends.map((t) => (
            <TransactionRow
              key={t.id}
              merchant={t.counterparty ?? t.counterpartyVpa ?? 'Unknown payee'}
              date={new Date(t.date)}
              money={{ amountMinor: -t.amountMinor, currency: 'INR' }}
              onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: t.id } })}
            />
          ))}
        </Card>
      ) : (
        <Text variant="body" color="textSecondary">
          Nothing yet.
        </Text>
      )}

      {earlier.length ? (
        <View style={styles.earlier}>
          <Text variant="heading">Earlier statements</Text>
          {earlier.map((s) => (
            <View key={s.id} style={styles.row}>
              <Text variant="body" style={styles.grow}>{`Due ${due(s.dueDate)}${s.paid ? ', paid' : ''}`}</Text>
              <AmountText money={{ amountMinor: s.totalDueMinor, currency: 'INR' }} />
            </View>
          ))}
        </View>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.sm, gap: 0 },
  earlier: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  grow: { flex: 1, minWidth: 0 },
});
