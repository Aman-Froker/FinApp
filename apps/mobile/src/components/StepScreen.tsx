import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/tokens';

type Props = { children: ReactNode; actions?: ReactNode };

// One onboarding step: content scrolls, the actions stay pinned within thumb reach.
export function StepScreen({ children, actions }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }]}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // The status bar inset is already added on the root; this is only breathing room below it.
  content: { flexGrow: 1, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg },
  actions: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
});
