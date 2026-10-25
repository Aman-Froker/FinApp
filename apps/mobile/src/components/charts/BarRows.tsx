import { StyleSheet, View } from 'react-native';

import { AmountText } from '../AmountText';
import { Text } from '../Text';
import { formatMoney, type Money } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Row = { label: string; money: Money };

type Props = { rows: Row[]; locale?: string };

// Horizontal rules, one per category: a 2pt accent fill over a hairline track, value at the end.
export function BarRows({ rows, locale }: Props) {
  const { colors } = useTheme();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.money.amountMinor)));
  return (
    <View style={styles.list}>
      {rows.map((r) => (
        <View
          key={r.label}
          style={styles.row}
          accessible
          accessibilityLabel={`${r.label}, ${formatMoney(r.money, locale)}`}
        >
          <View style={styles.head}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.label}>
              {r.label}
            </Text>
            <AmountText money={r.money} locale={locale} />
          </View>
          <View style={[styles.track, { backgroundColor: colors.rule }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.accent, width: `${(Math.abs(r.money.amountMinor) / max) * 100}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  row: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  label: { flex: 1, minWidth: 0 },
  track: { height: 2 },
  fill: { height: 2 },
});
