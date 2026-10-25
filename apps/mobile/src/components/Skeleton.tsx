import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { hairline, radius, space } from '@/theme/tokens';

type Props = { width?: DimensionValue; height?: number; round?: number };

// A slow opacity pulse. Reduced motion gets a static block.
const pulse = {
  animationName: { from: { opacity: 0.45 }, to: { opacity: 1 } },
  animationDuration: 900,
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
} as const;

export function Skeleton({ width = '100%', height = 16, round = radius.sm }: Props) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={[
        { width, height, borderRadius: round, backgroundColor: colors.skeleton },
        reduced ? styles.still : pulse,
      ]}
    />
  );
}

export function TransactionRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.rule }]}>
      <View style={styles.main}>
        <Skeleton width="60%" />
        <Skeleton width="35%" height={12} />
      </View>
      <Skeleton width={72} />
    </View>
  );
}

const styles = StyleSheet.create({
  still: { opacity: 0.8 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
  },
  main: { flex: 1, gap: space.sm },
});
