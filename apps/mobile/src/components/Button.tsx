import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import {
  BUTTON_DEPTH,
  pressTransition,
  pressedDown,
  pressedScale,
  radius,
  space,
  type ColorRole,
} from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
};

const foreground: Record<ButtonVariant, ColorRole> = {
  primary: 'onAccent',
  secondary: 'text',
  ghost: 'accent',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  fullWidth,
  accessibilityHint,
}: Props) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const inactive = !!disabled || !!loading;
  const fg = foreground[variant];
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={4}
      pressRetentionOffset={16}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[fullWidth ? styles.full : styles.self, { opacity: inactive ? 0.5 : 1 }]}
    >
      {/* The shell is the solid shadow; the face drops onto it while pressed. */}
      <View style={[styles.shell, primary && { backgroundColor: colors.accentShadow, paddingBottom: BUTTON_DEPTH }]}>
        <Animated.View
          style={[
            styles.face,
            pressTransition,
            {
              backgroundColor: primary ? colors.accent : variant === 'secondary' ? colors.surface : 'transparent',
              borderColor: variant === 'secondary' ? colors.rule : 'transparent',
            },
            pressed && (primary ? pressedDown : pressedScale),
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors[fg]} />
          ) : icon ? (
            <Icon name={icon} color={fg} size={20} />
          ) : null}
          <Text variant="bodyStrong" color={fg}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  self: { alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  shell: { borderRadius: radius.md },
  face: {
    minHeight: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
});
