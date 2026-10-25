import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { space } from '@/theme/tokens';

type Props = {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
};

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={32} color="textSecondary" />
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button variant="secondary" label={action.label} onPress={action.onPress} icon={action.icon} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  action: { marginTop: space.sm },
});
