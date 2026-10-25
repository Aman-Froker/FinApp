import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { pressTransition, pressedScale } from '@/theme/tokens';

type Props = { icon: IconName; label: string; onPress: () => void };

// A 44pt icon-only button; the label is what screen readers announce.
export function IconButton({ icon, label, onPress }: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
    >
      <Animated.View style={[styles.face, pressTransition, pressed && pressedScale]}>
        <Icon name={icon} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({ face: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
