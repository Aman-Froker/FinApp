import { Pressable, StyleSheet, View } from 'react-native';

import { AmountText } from './AmountText';
import { Text } from './Text';
import { formatDate, formatMoney, type Money } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { hairline, space } from '@/theme/tokens';

type Props = {
  merchant: string;
  category?: string;
  date: Date;
  money: Money;
  pending?: boolean;
  onPress?: () => void;
  locale?: string;
};

export function TransactionRow({ merchant, category, date, money, pending, onPress, locale }: Props) {
  const { colors } = useTheme();
  const meta = [category, formatDate(date, locale), pending ? 'Pending' : undefined]
    .filter(Boolean)
    .join(' · ');
  const income = money.amountMinor > 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${merchant}, ${meta}, ${formatMoney(money, locale)}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.rule, backgroundColor: pressed ? colors.surface : 'transparent' },
      ]}
    >
      <View style={styles.main}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {merchant}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <AmountText money={money} tone={income ? 'signed' : 'neutral'} showPlus={income} locale={locale} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
  },
  main: { flex: 1, minWidth: 0, gap: space.xxs },
});
