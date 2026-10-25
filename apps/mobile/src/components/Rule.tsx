import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { hairline } from '@/theme/tokens';

export function Rule() {
  const { colors } = useTheme();
  return <View style={{ height: hairline, backgroundColor: colors.rule }} />;
}
