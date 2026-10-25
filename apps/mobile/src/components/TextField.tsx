import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

type Props = TextInputProps & {
  label: string;
  helper?: string;
  error?: string;
};

export function TextField({ label, helper, error, style, onFocus, onBlur, ...rest }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.negative : focused ? colors.accent : colors.rule;
  const note = error ?? helper;
  return (
    <View style={styles.wrap}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        accessibilityHint={note}
        placeholderTextColor={colors.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          type.body,
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor },
          style,
        ]}
      />
      {note ? (
        <Text
          variant="caption"
          color={error ? 'negative' : 'textSecondary'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
