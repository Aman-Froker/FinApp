import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { elevation, motion, radius, space } from '@/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

// Only the spring configs may be captured by worklets; the easing objects in `motion` cannot be copied.
const SPRING_SETTLE = motion.spring.settle;
const SPRING_SHEET = motion.spring.sheet;
const FADE_MS = motion.duration.fast;

// Where a flick would come to rest if it kept decelerating (Apple's exponential decay form).
function project(velocity: number, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// The further past the edge, the less the sheet follows.
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// A sheet that lives inside a screen. A sheet that is its own destination uses
// presentation: 'formSheet' on the native stack instead of this.
export function BottomSheet({ visible, onClose, title, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { height: screenH } = useWindowDimensions();
  // The modal stays mounted while the close animation runs.
  const [closing, setClosing] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    setClosing(!visible);
  }
  const mounted = visible || closing;
  const translateY = useSharedValue(screenH);
  const sheetH = useSharedValue(screenH);
  const start = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (reduced) {
        translateY.set(0);
        fade.set(withTiming(1, { duration: FADE_MS }));
      } else {
        fade.set(1);
        translateY.set(withSpring(0, SPRING_SHEET));
      }
      return;
    }
    if (!closing) return;
    const finish = () => setClosing(false);
    if (reduced) {
      fade.set(withTiming(0, { duration: FADE_MS }, (done) => done && scheduleOnRN(finish)));
    } else {
      translateY.set(
        withSpring(sheetH.get(), { ...SPRING_SETTLE, overshootClamping: true }, (done) => {
          if (done) scheduleOnRN(finish);
        }),
      );
    }
  }, [visible, closing, reduced, translateY, fade, sheetH]);

  const onLayout = (e: LayoutChangeEvent) => sheetH.set(e.nativeEvent.layout.height);

  const pan = usePanGesture({
    activeOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      start.set(translateY.get());
    },
    onUpdate: (e) => {
      'worklet';
      const next = start.get() + e.translationY;
      translateY.set(next >= 0 ? next : rubberband(next, sheetH.get()));
    },
    onDeactivate: (e) => {
      'worklet';
      const projected = translateY.get() + project(e.velocityY);
      if (projected > sheetH.get() * 0.4) {
        translateY.set(
          withSpring(
            sheetH.get(),
            { ...SPRING_SETTLE, velocity: e.velocityY, overshootClamping: true },
            (done) => done && scheduleOnRN(onClose),
          ),
        );
      } else {
        translateY.set(withSpring(0, { ...SPRING_SHEET, velocity: e.velocityY }));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ translateY: translateY.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 0.4 * fade.get() * interpolate(translateY.get(), [0, sheetH.get()], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.root} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={onLayout}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            elevation.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={[styles.grabber, { backgroundColor: colors.rule }]} />
              <View style={styles.titleRow}>
                <Text variant="title" accessibilityRole="header" style={styles.title} numberOfLines={1}>
                  {title ?? ''}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={styles.close}
                >
                  <Icon name="close" size={20} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, backgroundColor: '#000000' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
  },
  header: { paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.full },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -space.md },
  body: { gap: space.lg },
});
