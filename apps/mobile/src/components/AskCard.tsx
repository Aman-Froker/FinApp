import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Props = { unlocks: string; title: string; body: string; cta: string; onAccept: () => void; onDecline: () => void };

// A give-to-get ask: what we would like, what it unlocks, and an easy no. Its tint and "Unlocks"
// label set it apart from the cards that show the user's own figures.
export function AskCard({ unlocks, title, body, cta, onAccept, onDecline }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.accentSoft }]} accessibilityRole="summary">
      <Text variant="label" color="textSecondary">
        {`Unlocks: ${unlocks}`}
      </Text>
      <Text variant="heading">{title}</Text>
      <Text variant="body" color="textSecondary">
        {body}
      </Text>
      <View style={styles.actions}>
        <Button label={cta} onPress={onAccept} />
        <Button label="Not now" variant="ghost" onPress={onDecline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xs },
});
