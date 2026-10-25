import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Text } from '../Text';
import { formatMoney } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamily } from '@/theme/tokens';

type Props = {
  // Oldest first, in minor units of `currency`.
  values: number[];
  currency: string;
  height?: number;
  accessibilityLabel: string;
  locale?: string;
};

const LABEL_WIDTH = 88;
const PAD = 6;

// Ink hairline, no fill, no gridlines: the latest value is labelled directly at the line's end.
export function LineChart({ values, currency, height = 120, accessibilityLabel, locale }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (values.length < 2) {
    return (
      <Text variant="caption" color="textSecondary">
        Not enough data to draw yet
      </Text>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotW = Math.max(0, width - LABEL_WIDTH);
  const x = (i: number) => (i / (values.length - 1)) * plotW;
  const y = (v: number) => PAD + (1 - (v - min) / range) * (height - PAD * 2);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' ');
  const last = values[values.length - 1]!;

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} y1={height - 0.5} x2={plotW} y2={height - 0.5} stroke={colors.rule} strokeWidth={1} />
          <Path d={d} stroke={colors.text} strokeWidth={1.5} fill="none" strokeLinejoin="miter" />
          <Circle cx={x(values.length - 1)} cy={y(last)} r={3} fill={colors.text} />
          <SvgText
            x={plotW + 8}
            y={y(last)}
            fill={colors.text}
            fontFamily={fontFamily.textMedium}
            fontSize={13}
            alignmentBaseline="middle"
          >
            {formatMoney({ amountMinor: last, currency }, locale)}
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}
