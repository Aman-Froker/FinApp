import { CATEGORIES, type Category } from '@finapp/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, Chip, EmptyState, ScreenHeader, Skeleton, StepScreen, Text, TextField } from '@/components';
import { markAsk } from '@/data/journey';
import { saveLabels, shareLabels, type Label } from '@/data/labels';
import { loadMoney } from '@/data/refresh';
import { unknownSpend } from '@/domain/asks';
import { track } from '@/lib/device';
import { plural } from '@/lib/format';
import { space } from '@/theme/tokens';

type Draft = { name: string; category: Category | null };

export default function Labels() {
  const queryClient = useQueryClient();
  const payees = useQuery({ queryKey: ['money'], queryFn: () => loadMoney(), select: (m) => unknownSpend(m.txns, new Date()).unknownPayees });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const set = (vpa: string, d: Partial<Draft>) => setDrafts((all) => ({ ...all, [vpa]: { ...(all[vpa] ?? { name: '', category: null }), ...d } }));

  const named: Label[] = Object.entries(drafts)
    .filter(([, d]) => d.name.trim())
    .map(([vpa, d]) => ({ vpa, merchantName: d.name.trim(), category: d.category }));

  const save = async () => {
    await saveLabels(named, 'user');
    await markAsk('label_payees', 'accepted');
    track('ask_accepted', { type: 'label_payees', count: named.length });
    // Best effort, and only shop labels: helps other people's apps name the same shops.
    shareLabels(named).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: ['money'] });
    router.back();
  };

  if (!payees.data) {
    return (
      <StepScreen>
        <ScreenHeader title="Name your payees" />
        <Skeleton height={240} round={16} />
      </StepScreen>
    );
  }
  return (
    <StepScreen actions={payees.data.length ? <Button label={named.length ? `Save ${plural(named.length, 'name')}` : 'Save'} fullWidth disabled={!named.length} onPress={save} /> : undefined}>
      <ScreenHeader title="Name your payees" />
      {payees.data.length ? (
        <Text variant="body" color="textSecondary">
          Your bank shows only a UPI ID for these. Name the ones you recognise; leave the rest. Names of shops help other Fin App users too,
          without anything that identifies you. Payments to people stay on your phone.
        </Text>
      ) : (
        <EmptyState icon="check" title="Every payee has a name" body="There is nothing to name right now." />
      )}
      {payees.data.map((p) => (
        <Card key={p.vpa}>
          <View style={styles.head}>
            <View style={styles.grow}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {p.vpa}
              </Text>
              <Text variant="caption" color="textSecondary">
                {`${plural(p.count, 'payment')} in the last 3 months`}
              </Text>
            </View>
            <AmountText money={{ amountMinor: p.totalMinor, currency: 'INR' }} />
          </View>
          <TextField label="Name" placeholder="For example, Sharma General Store" value={drafts[p.vpa]?.name ?? ''} onChangeText={(name) => set(p.vpa, { name })} maxLength={60} />
          <View style={styles.chips} accessibilityLabel={`Category for ${p.vpa}`}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={drafts[p.vpa]?.category === c} onPress={() => set(p.vpa, { category: drafts[p.vpa]?.category === c ? null : c })} />
            ))}
          </View>
        </Card>
      ))}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
