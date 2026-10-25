import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, EmptyState, ScreenHeader, Text, TextField, TransactionRow } from '@/components';
import { loadMoney } from '@/data/refresh';
import { payeeOf, type Kind, type Txn } from '@/domain/detect';
import { isEmpty, matches, parseQuery } from '@/domain/search';
import { formatDate, formatMoney, plural } from '@/lib/format';
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

  const [search, setSearch] = useState('');
  // Typing stays responsive while thousands of rows are filtered behind it.
  const query = useDeferredValue(search);

  const { sections, found } = useMemo(() => {
    const kinds = FILTERS[filter]!.kinds;
    const q = parseQuery(query, new Date());
    const searching = !isEmpty(q);
    const byDay = new Map<string, Txn[]>();
    const total = { count: 0, outMinor: 0, inMinor: 0 };
    for (const t of [...(money.data?.txns ?? [])].reverse()) {
      if (kinds && !kinds.includes(t.kind)) continue;
      if (searching && !matches(t, q)) continue;
      total.count += 1;
      if (t.status === 'success') total[t.direction === 'debit' ? 'outMinor' : 'inMinor'] += t.amountMinor;
      const d = formatDate(new Date(t.date));
      byDay.set(d, [...(byDay.get(d) ?? []), t]);
    }
    return { sections: [...byDay.entries()].map(([title, data]) => ({ title, data })), found: searching ? total : null };
  }, [money.data, filter, query]);
  const inr = (amountMinor: number) => formatMoney({ amountMinor, currency: 'INR' });

  return (
    <SectionList
      sections={sections}
      keyExtractor={(t) => t.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // Thousands of rows: keep a few screens mounted instead of the default 21, and let Android
      // drop off-screen views. Native memory otherwise grows with every screen scrolled.
      windowSize={5}
      initialNumToRender={15}
      maxToRenderPerBatch={15}
      removeClippedSubviews
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl }]}
      ListHeaderComponent={
        <View style={styles.head}>
          <ScreenHeader title="Transactions" />
          <TextField
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, UPI ID, amount or date"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <View style={styles.chips} accessibilityRole="radiogroup">
            {FILTERS.map((f, i) => (
              <Chip key={f.label} label={f.label} selected={i === filter} onPress={() => setFilter(i)} />
            ))}
          </View>
          {found && found.count ? (
            <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
              {[plural(found.count, 'transaction'), found.outMinor ? `${inr(found.outMinor)} out` : null, found.inMinor ? `${inr(found.inMinor)} in` : null]
                .filter(Boolean)
                .join(', ')}
            </Text>
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text variant="label" color="textSecondary" style={[styles.day, { backgroundColor: colors.background }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item: t }) => (
        <TransactionRow
          merchant={payeeOf(t)}
          category={KIND_LABEL[t.kind]}
          date={new Date(t.date)}
          money={{ amountMinor: t.direction === 'debit' ? -t.amountMinor : t.amountMinor, currency: 'INR' }}
          onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: t.id } })}
        />
      )}
      ListEmptyComponent={
        money.data ? (
          found ? (
            <EmptyState
              icon="transactions"
              title="Nothing matches"
              body="Try part of a name or UPI ID, an amount such as 500, 500-1000 or >2000, a date such as 24 Oct, or a /pattern/."
            />
          ) : (
            <EmptyState icon="transactions" title="Nothing here" body="No transactions of this kind in your bank messages yet." />
          )
        ) : undefined
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
