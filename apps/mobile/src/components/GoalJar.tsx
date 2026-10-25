import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius } from '@/theme/tokens';

type Props = {
  // Share of the goal in the jar before and after this week, 0 to 1.
  from: number;
  to: number;
  accessibilityLabel: string;
};

const W = 96;
const H = 128;
// Seen once a week, so it takes longer than UI motion: the fill rising is the reward.
const FILL_MS = 700;

// The goal jar. The fill is an absolute, childless view moved with a transform, so the rise stays
// on the UI thread. With reduced motion it simply shows the new level.
export function GoalJar({ from, to, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const clamp = (r: number) => Math.min(1, Math.max(0, r));
  // One frame at the old level first, so the transition has somewhere to start from.
  const [risen, setRisen] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const frame = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(frame);
  }, [reduced]);
  const level = clamp(reduced || risen ? to : from);

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={[styles.lid, { backgroundColor: colors.textSecondary }]} />
      <View style={[styles.jar, { borderColor: colors.textSecondary, backgroundColor: colors.surface }]}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: colors.positive },
            {
              transform: [{ translateY: H * (1 - level) }],
              transitionProperty: 'transform',
              transitionDuration: reduced ? 0 : FILL_MS,
              transitionTimingFunction: motion.css.out,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  lid: { width: W * 0.7, height: 10, borderRadius: radius.sm },
  jar: { width: W, height: H, borderWidth: 3, borderRadius: radius.lg, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, height: H },
});
