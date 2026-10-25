import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { formatMoney, type Money } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type MessageReference = { id: string; label: string; money?: Money };

type AssistantProps = {
  text: string;
  // The transactions and totals the reply was built from, shown as numbered footnotes.
  references?: MessageReference[];
  onPressReference?: (ref: MessageReference) => void;
  streaming?: boolean;
  locale?: string;
};

// The assistant sits on a tinted surface. No side rules on rounded containers: they read as brackets.
export function AssistantMessage({ text, references, onPressReference, streaming, locale }: AssistantProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.assistant, { backgroundColor: colors.accentSoft }]}>
      <Text variant="overline" color="accent">
        Assistant
      </Text>
      <Text variant="prose">{text}</Text>
      {streaming ? (
        <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
          Writing
        </Text>
      ) : null}
      {references?.length ? (
        <View style={[styles.refs, { borderTopColor: colors.rule }]}>
          {references.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={onPressReference ? () => onPressReference(r) : undefined}
              disabled={!onPressReference}
              accessibilityRole={onPressReference ? 'button' : undefined}
              accessibilityLabel={`Reference ${i + 1}, ${r.label}${r.money ? `, ${formatMoney(r.money, locale)}` : ''}`}
              style={styles.ref}
            >
              <Text variant="caption" color="textSecondary" tabular style={styles.refNumber}>
                {i + 1}
              </Text>
              <Text variant="caption" style={styles.refLabel} numberOfLines={2}>
                {r.label}
              </Text>
              {r.money ? (
                <Text variant="caption" tabular>
                  {formatMoney(r.money, locale)}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function UserMessage({ text }: { text: string }) {
  return (
    <View style={styles.user}>
      <Text variant="overline" color="textSecondary">
        You
      </Text>
      <Text variant="body">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  assistant: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
  },
  user: { gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.xs },
  refs: { marginTop: space.xs, paddingTop: space.sm, gap: space.xs, borderTopWidth: 1 },
  ref: { flexDirection: 'row', gap: space.sm, minHeight: 24, alignItems: 'flex-start' },
  refNumber: { width: 16 },
  refLabel: { flex: 1, minWidth: 0 },
});
