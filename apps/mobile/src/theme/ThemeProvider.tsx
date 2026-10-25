import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { colors, type Colors, type ColorScheme } from './tokens';

type Theme = { colors: Colors; scheme: ColorScheme };

const ThemeContext = createContext<Theme>({ colors: colors.light, scheme: 'light' });

export function ThemeProvider({
  scheme = 'system',
  children,
}: {
  scheme?: ColorScheme | 'system';
  children: ReactNode;
}) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme !== 'system' ? scheme : system === 'dark' ? 'dark' : 'light';
  const value = useMemo(() => ({ colors: colors[resolved], scheme: resolved }), [resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
