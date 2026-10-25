import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { space } from '@/theme/tokens';

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ title = 'Something went wrong', message, onRetry }: Props) {
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Icon name="warning" size={32} color="negative" />
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {message}
      </Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button variant="secondary" label="Try again" icon="refresh" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  action: { marginTop: space.sm },
});
