import { StyleSheet, type TextStyle } from 'react-native';
import { cubicBezier, Easing } from 'react-native-reanimated';

// Direction "Market": Ledger's money typography under warm consumer-app chrome.

export const colors = {
  light: {
    background: '#FFF7EE',
    surface: '#FFFFFF',
    text: '#1F1A17',
    textSecondary: '#6E645B',
    rule: '#EADFD2',
    accent: '#E4572E',
    accentShadow: '#B8431F',
    accentSoft: '#FDEBE4',
    onAccent: '#FFFFFF',
    positive: '#1E8A5A',
    negative: '#C62B2B',
    warning: '#9A6A00',
    skeleton: '#F1E7DB',
  },
  dark: {
    background: '#16130F',
    surface: '#221D18',
    text: '#F4EDE4',
    textSecondary: '#A89D91',
    rule: '#352D26',
    accent: '#FF7A4D',
    accentShadow: '#C9552B',
    accentSoft: '#3A2419',
    onAccent: '#16130F',
    positive: '#5CCB93',
    negative: '#F57B73',
    warning: '#E5B23F',
    skeleton: '#2E2721',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Colors = { [K in keyof (typeof colors)['light']]: string };
export type ColorRole = keyof Colors;

// Keys match the families registered in fonts.ts.
export const fontFamily = {
  display: 'Baloo2_800ExtraBold',
  displayMedium: 'Baloo2_700Bold',
  text: 'PlusJakartaSans_400Regular',
  textMedium: 'PlusJakartaSans_500Medium',
  textSemiBold: 'PlusJakartaSans_600SemiBold',
  textBold: 'PlusJakartaSans_700Bold',
} as const;

// Baloo for words at display sizes; Plus Jakarta for every figure, so amounts stay precise.
export const type = {
  displayLarge: { fontFamily: fontFamily.textBold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  display: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  title: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
  heading: { fontFamily: fontFamily.displayMedium, fontSize: 18, lineHeight: 24, letterSpacing: 0 },
  prose: { fontFamily: fontFamily.text, fontSize: 17, lineHeight: 26, letterSpacing: 0 },
  body: { fontFamily: fontFamily.text, fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  bodyStrong: { fontFamily: fontFamily.textSemiBold, fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  label: { fontFamily: fontFamily.textSemiBold, fontSize: 13, lineHeight: 16, letterSpacing: 0.1 },
  caption: { fontFamily: fontFamily.text, fontSize: 13, lineHeight: 16, letterSpacing: 0.1 },
  overline: {
    fontFamily: fontFamily.textBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { none: 0, sm: 8, md: 12, lg: 16, full: 999 } as const;

export const hairline = StyleSheet.hairlineWidth;

export const elevation = {
  card: {
    shadowColor: '#1F1A17',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

export const motion = {
  duration: { press: 120, fast: 160, base: 220, sheet: 300 },
  easing: {
    out: Easing.bezier(0.23, 1, 0.32, 1),
    inOut: Easing.bezier(0.77, 0, 0.175, 1),
    sheet: Easing.bezier(0.32, 0.72, 0, 1),
  },
  css: {
    out: cubicBezier(0.23, 1, 0.32, 1),
    inOut: cubicBezier(0.77, 0, 0.175, 1),
  },
  spring: {
    settle: { duration: 400, dampingRatio: 1 },
    sheet: { duration: 300, dampingRatio: 0.8 },
  },
} as const;

// Press feedback: a CSS transition on transform, under 120ms.
export const pressTransition = {
  transform: [{ translateY: 0 }, { scale: 1 }],
  transitionProperty: 'transform',
  transitionDuration: motion.duration.press,
  transitionTimingFunction: motion.css.out,
} as const;

// Secondary and ghost controls shrink 3 percent.
export const pressedScale = { transform: [{ translateY: 0 }, { scale: 0.97 }] } as const;

// The primary button sits on a 4pt solid shadow and drops onto it when pressed.
export const BUTTON_DEPTH = 4;
export const pressedDown = { transform: [{ translateY: BUTTON_DEPTH }, { scale: 1 }] } as const;
