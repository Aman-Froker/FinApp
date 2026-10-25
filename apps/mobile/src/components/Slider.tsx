import { useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Props = {
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  // Spoken value, e.g. "₹1,200".
  valueText: string;
};

const THUMB = 28;
const HEIGHT = 44;

// Drag or tap anywhere on the track. Snaps to `step`; screen readers adjust it by one step a swipe.
export function Slider({ value, max, step, onChange, accessibilityLabel, valueText }: Props) {
  const { colors } = useTheme();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const last = useSharedValue(value);

  useEffect(() => {
    if (last.get() !== value && width.get()) x.set((value / max) * width.get());
    last.set(value);
  }, [value, max, last, width, x]);

  // The track is inset by half a thumb each side, so the thumb never hangs past the edge.
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - THUMB;
    width.set(w);
    x.set((value / max) * w);
  };

  const moveTo = (px: number) => {
    'worklet';
    const w = width.get();
    if (!w) return;
    const clamped = Math.min(Math.max(px, 0), w);
    x.set(clamped);
    const v = Math.round(((clamped / w) * max) / step) * step;
    if (v !== last.get()) {
      last.set(v);
      scheduleOnRN(onChange, v);
    }
  };

  const pan = usePanGesture({
    minDistance: 0,
    onActivate: (e) => {
      'worklet';
      moveTo(e.x - THUMB / 2);
    },
    onUpdate: (e) => {
      'worklet';
      moveTo(e.x - THUMB / 2);
    },
  });

  const fill = useAnimatedStyle(() => ({ width: x.get() }));
  // The thumb is absolute from the outer edge, half a thumb left of the track, so x is its left edge.
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.hit}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}
      >
        <View style={[styles.track, { backgroundColor: colors.rule }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fill]} />
        </View>
        <Animated.View style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.accent }, thumb]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: HEIGHT, justifyContent: 'center', paddingHorizontal: THUMB / 2 },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: 8 },
  thumb: { position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
});
