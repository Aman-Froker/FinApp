import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import type { ColorRole } from '@/theme/tokens';

// A small custom set on a 24pt grid: 1.75pt strokes with rounded ends, drawn to sit beside Baloo.
const paths = {
  home: 'M4 11 12 4l8 7M6 10v10h12V10M10 20v-6h4v6',
  transactions: 'M4 7h10M4 12h10M4 17h10M17 7h3M17 12h3M17 17h3',
  budgets: 'M4 20h16M6 20V9M11 20V4M16 20v-6',
  bills: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  assistant: 'M12 2 6 14l6 8 6-8-6-12zM12 10v12',
  streak: 'M12 3c0 4-5 5-5 10a5 5 0 0 0 10 0c0-2-1-3-2-4 0 2-1 3-2 3 0-3-1-6-1-9z',
  add: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  check: 'M5 12l5 5 9-10',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 21 21',
  import: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
  settings: 'M4 7h10M18 7h2M14 4v6M4 17h2M10 17h10M10 14v6',
  arrowUpRight: 'M7 17 17 7M9 7h8v8',
  arrowDownRight: 'M7 7l10 10M17 9v8H9',
  warning: 'M12 4 2 20h20L12 4zM12 10v5M12 18v1',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
} as const;

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths) as IconName[];

type Props = {
  name: IconName;
  size?: number;
  color?: ColorRole;
  // Icons are decorative unless given a label.
  accessibilityLabel?: string;
};

export function Icon({ name, size = 24, color = 'text', accessibilityLabel }: Props) {
  const { colors } = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Path d={paths[name]} stroke={colors[color]} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
