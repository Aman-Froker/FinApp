import { Text as RNText } from 'react-native';

import { Text } from './Text';
import { formatMoney, formatMoneyParts, type Money } from '@/lib/format';
import { fontFamily, type ColorRole } from '@/theme/tokens';

type Props = {
  money: Money;
  // display: hero amount with smaller, lighter minor units. row: list size.
  size?: 'display' | 'row';
  // signed: colour by sign. neutral: ink.
  tone?: 'neutral' | 'signed';
  showPlus?: boolean;
  locale?: string;
};

export function AmountText({ money, size = 'row', tone = 'neutral', showPlus, locale }: Props) {
  const { sign, major, minor, suffix } = formatMoneyParts(money, locale);
  const n = money.amountMinor;
  const color: ColorRole =
    tone === 'signed' ? (n < 0 ? 'negative' : n > 0 ? 'positive' : 'text') : 'text';
  const prefix = sign || (showPlus && n > 0 ? '+' : '');
  const variant = size === 'display' ? 'displayLarge' : 'bodyStrong';
  return (
    // A display amount shrinks to fit one line rather than wrapping mid-number at large text sizes.
    <Text
      variant={variant}
      color={color}
      tabular
      accessibilityLabel={formatMoney(money, locale)}
      numberOfLines={size === 'display' ? 1 : undefined}
      adjustsFontSizeToFit={size === 'display'}
    >
      {prefix}
      {major}
      <RNText style={size === 'display' ? styles.displayMinor : undefined}>{minor}</RNText>
      {suffix}
    </Text>
  );
}

const styles = {
  displayMinor: { fontSize: 24, lineHeight: 46, fontFamily: fontFamily.textMedium },
};
