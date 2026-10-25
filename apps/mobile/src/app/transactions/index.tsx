import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, EmptyState, ScreenHeader, Text, TransactionRow } from '@/components';
import { loadMoney } from '@/data/refresh';
import type { Kind, Txn } from '@/domain/detect';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const FILTERS: { label: string; kinds: Kind[] | null }[] = [
  { label: 'All', kinds: null },
  { label: 'Spending', kinds: ['spend', 'fee'] },
  { label: 'Money in', kinds: ['income', 'refund'] },
  { label: 'Transfers', kinds: ['transfer'] },
];

const KIND_LABEL: Record<Kind, string> = { spend: 'Spending', fee: 'Charge', income: 'Money in', refund: 'Refund', transfer: 'Transfer' };

export default function Transactions() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [filter, setFilter] = useState(0);
  const money = useQuery({ queryKey: ['money'], queryFn: () => loadMoney() });

  const sections = useMemo(() => {
    const kinds = FILTERS[filter]!.kinds;
    const byDay = new Map<string, Txn[]>();
    for (const t of [...(money.data?.txns ?? [])].reverse()) {
      if (kinds && !kinds.includes(t.kind)) continue;
      const d = formatDate(new Date(t.date));
      byDay.set(d, [...(byDay.get(d) ?? []), t]);
    }
    return [...byDay.entries()].map(([title, data]) => ({ title, data }));
  }, [money.data, filter]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(t) => t.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl }]}
      ListHeaderComponent={
        <View style={styles.head}>
          <ScreenHeader title="Transactions" />
          <View style={styles.chips} accessibilityRole="radiogroup">
            {FILTERS.map((f, i) => (
              <Chip key={f.label} label={f.label} selected={i === filter} onPress={() => setFilter(i)} />
            ))}
          </View>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text variant="label" color="textSecondary" style={[styles.day, { backgroundColor: colors.background }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item: t }) => (
        <TransactionRow
          merchant={t.counterparty ?? t.counterpartyVpa ?? 'Unknown payee'}
          category={KIND_LABEL[t.kind]}
          date={new Date(t.date)}
          money={{ amountMinor: t.direction === 'debit' ? -t.amountMinor : t.amountMinor, currency: 'INR' }}
          onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: t.id } })}
        />
      )}
      ListEmptyComponent={
        money.data ? <EmptyState icon="transactions" title="Nothing here" body="No transactions of this kind in your bank messages yet." /> : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.lg },
  head: { gap: space.md, paddingBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  day: { paddingTop: space.lg, paddingBottom: space.xs },
});
