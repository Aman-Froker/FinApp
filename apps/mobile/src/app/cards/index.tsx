import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, EmptyState, Icon, Rule, ScreenHeader, Skeleton, StepScreen, Text } from '@/components';
import { loadCards } from '@/data/ingest';
import { statusOf } from '@/domain/cards';
import { formatMoney } from '@/lib/format';
import { space } from '@/theme/tokens';

const inr = (amountMinor: number) => formatMoney({ amountMinor, currency: 'INR' });

export default function Cards() {
  const cards = useQuery({ queryKey: ['cards'], queryFn: loadCards });
  return (
    <StepScreen>
      <ScreenHeader title="Your cards" />
      {!cards.data ? (
        <Skeleton height={160} round={16} />
      ) : cards.data.length ? (
        <Card style={styles.list}>
          {cards.data.map((c, i) => (
            <View key={c.last4}>
              {i ? <Rule /> : null}
              <Pressable
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`Card ending ${c.last4}, ${statusOf(c)}`}
                onPress={() => router.push({ pathname: '/cards/[last4]', params: { last4: c.last4 } })}
              >
                <View style={styles.grow}>
                  <Text variant="bodyStrong">{`Card ending ${c.last4}`}</Text>
                  <Text variant="body" color="textSecondary">
                    {statusOf(c)}
                  </Text>
                  {c.spentSinceMinor ? (
                    <Text variant="caption" color="textSecondary">
                      {`${inr(c.spentSinceMinor)} spent since ${c.statements[0] ? 'the last statement' : 'we started reading'}`}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevron" size={20} color="textSecondary" />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon="bills"
          title="No cards yet"
          body="Card statements and card payments from your bank messages or forwarded emails appear here."
        />
      )}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.sm, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  grow: { flex: 1, minWidth: 0, gap: space.xxs },
});
