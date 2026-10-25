import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { space } from '@/theme/tokens';

// Back button and title for screens pushed on top of home.
export function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={styles.row}>
      <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Text variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginLeft: -space.md },
  title: { flex: 1 },
});
