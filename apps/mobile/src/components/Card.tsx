import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { elevation, radius, space } from '@/theme/tokens';

// A white surface with a hairline and a soft 2pt shadow. Never glass, never a bento grid.
export function Card({ style, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View
      {...rest}
      style={[styles.card, elevation.card, { backgroundColor: colors.surface, borderColor: colors.rule }, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
});
