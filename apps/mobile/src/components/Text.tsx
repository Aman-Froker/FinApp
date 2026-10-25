import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { type ColorRole, type TypeVariant, type } from '@/theme/tokens';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: ColorRole;
  tabular?: boolean;
  align?: 'left' | 'center' | 'right';
};

export function Text({ variant = 'body', color = 'text', tabular, align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const large = variant === 'displayLarge' || variant === 'display' || variant === 'title';
  return (
    <RNText
      maxFontSizeMultiplier={large ? 1.5 : 2}
      {...rest}
      style={[type[variant], { color: colors[color], textAlign: align }, tabular && styles.tabular, style]}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
