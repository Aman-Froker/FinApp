import { Redirect, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AmountText,
  AssistantMessage,
  BarRows,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LineChart,
  ProgressRing,
  Rule,
  Skeleton,
  Text,
  TextField,
  TransactionRow,
  TransactionRowSkeleton,
  UserMessage,
  iconNames,
} from '@/components';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { colors as palette, space, type, type ColorScheme, type TypeVariant } from '@/theme/tokens';

// Dev-only review surface. These are labelled fixtures for looking at components, not product data.
const INR = 'INR';
const transactions = [
  { id: 't1', merchant: 'BigBasket', category: 'Groceries', date: new Date(2026, 9, 24), money: { amountMinor: -432700, currency: INR } },
  { id: 't2', merchant: 'Salary, Northwind Industries Pvt Ltd', category: 'Income', date: new Date(2026, 9, 23), money: { amountMinor: 8500000, currency: INR } },
  { id: 't3', merchant: 'Bartholomew Fitzgerald Independent Financial Advisers Limited', category: 'Fees', date: new Date(2026, 9, 22), money: { amountMinor: -120000, currency: INR }, pending: true },
  { id: 't4', merchant: 'Namma Metro', date: new Date(2026, 9, 22), money: { amountMinor: -4500, currency: INR } },
];
const balances = [1820400, 1795130, 1777000, 1766000, 10266000, 10172730, 9932000, 9888730, 9808730, 9781000, 9778200, 9658200, 9614930, 9571660];
const categories = [
  { label: 'Rent', money: { amountMinor: 2500000, currency: INR } },
  { label: 'Groceries', money: { amountMinor: 1241260, currency: INR } },
  { label: 'Transport', money: { amountMinor: 328400, currency: INR } },
  { label: 'Eating out', money: { amountMinor: 296200, currency: INR } },
];

export default function Gallery() {
  const [scheme, setScheme] = useState<ColorScheme | 'system'>('system');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ThemeProvider scheme={scheme}>
      <GalleryBody scheme={scheme} setScheme={setScheme} />
    </ThemeProvider>
  );
}

function GalleryBody({ scheme, setScheme }: { scheme: ColorScheme | 'system'; setScheme: (s: ColorScheme | 'system') => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [chip, setChip] = useState('This week');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl }]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Icon name="chevronLeft" />
        </Pressable>
        <Text variant="title" style={styles.grow}>Gallery</Text>
      </View>
      <View style={styles.row}>
        {(['system', 'light', 'dark'] as const).map((s) => (
          <Chip key={s} label={s} selected={scheme === s} onPress={() => setScheme(s)} />
        ))}
      </View>

      <Section title="Colours">
        <View style={styles.wrapRow}>
          {(Object.keys(colors) as (keyof typeof colors)[]).map((role) => (
            <View key={role} style={styles.swatch}>
              <View style={[styles.swatchBox, { backgroundColor: colors[role], borderColor: colors.rule }]} />
              <Text variant="caption">{role}</Text>
              <Text variant="caption" color="textSecondary" tabular>{palette.light[role]} / {palette.dark[role]}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type">
        {(Object.keys(type) as TypeVariant[]).map((v) => (
          <Text key={v} variant={v}>{v} 1,234.56</Text>
        ))}
        <Text variant="displayLarge" tabular>1111.11</Text>
        <Text variant="displayLarge" tabular>8888.88</Text>
        <Text variant="caption" color="textSecondary">The two lines above must be the same width: tabular figures.</Text>
      </Section>

      <Section title="Icons">
        <View style={styles.wrapRow}>
          {iconNames.map((n) => (
            <View key={n} style={styles.iconCell}>
              <Icon name={n} accessibilityLabel={n} />
              <Text variant="caption" color="textSecondary">{n}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Buttons and chips">
        <View style={styles.wrapRow}>
          <Button label="Add transaction" icon="add" onPress={() => {}} />
          <Button label="Import CSV" icon="import" variant="secondary" onPress={() => {}} />
          <Button label="Not now" variant="ghost" onPress={() => {}} />
          <Button label="Saving" loading onPress={() => {}} />
          <Button label="Disabled" disabled onPress={() => {}} />
        </View>
        <Button label="Continue" fullWidth onPress={() => {}} />
        <View style={styles.row}>
          {['This week', 'This month', 'Groceries', 'Bills'].map((c) => (
            <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
          ))}
          <Chip label="12 day streak" icon="streak" />
        </View>
      </Section>

      <Section title="Cards and budgets">
        <Card>
          <Text variant="label" color="textSecondary">Groceries, October</Text>
          <View style={styles.cardRow}>
            <View style={styles.grow}>
              <AmountText money={{ amountMinor: 1241260, currency: INR }} size="display" />
              <Text variant="caption" color="textSecondary">of ₹15,000 budget</Text>
            </View>
            <ProgressRing value={0.83} accessibilityLabel="83 percent of the groceries budget used">
              <Text variant="label" tabular>83%</Text>
            </ProgressRing>
          </View>
        </Card>
        <Card>
          <Text variant="label" color="textSecondary">Eating out, October</Text>
          <View style={styles.cardRow}>
            <View style={styles.grow}>
              <AmountText money={{ amountMinor: 296200, currency: INR }} size="display" />
              <Text variant="caption" color="negative">₹462 over budget</Text>
            </View>
            <ProgressRing value={1.18} accessibilityLabel="118 percent of the eating out budget used">
              <Text variant="label" tabular color="negative">118%</Text>
            </ProgressRing>
          </View>
        </Card>
      </Section>

      <Section title="Inputs">
        <TextField label="Account name" placeholder="Everyday current account" value={name} onChangeText={setName} helper="Shown on the accounts list." />
        <TextField label="Amount" placeholder="0.00" keyboardType="decimal-pad" inputMode="decimal" error="Enter an amount greater than zero." />
      </Section>

      <Section title="Amounts">
        <AmountText money={{ amountMinor: 9571660, currency: INR }} size="display" />
        <AmountText money={{ amountMinor: -123456789, currency: INR }} size="display" tone="signed" />
        <AmountText money={{ amountMinor: 0, currency: INR }} size="display" />
        <AmountText money={{ amountMinor: 150000, currency: 'JPY' }} size="display" />
        <AmountText money={{ amountMinor: 123456, currency: 'EUR' }} size="display" locale="fr-FR" />
        <View style={styles.row}>
          <AmountText money={{ amountMinor: 432700, currency: INR }} tone="signed" showPlus />
          <AmountText money={{ amountMinor: -432700, currency: INR }} tone="signed" />
          <AmountText money={{ amountMinor: -432700, currency: INR }} />
        </View>
      </Section>

      <Section title="Transaction rows">
        <Card style={styles.listCard}>
          {transactions.map((t) => (
            <TransactionRow key={t.id} {...t} onPress={() => {}} />
          ))}
        </Card>
      </Section>

      <Section title="Charts">
        <Card>
          <Text variant="label" color="textSecondary">Balance, last 14 days</Text>
          <LineChart values={balances} currency={INR} accessibilityLabel="Balance over the last 14 days, ending at ₹95,716.60" />
        </Card>
        <Card>
          <Text variant="label" color="textSecondary">Spend by category, October</Text>
          <BarRows rows={categories} />
        </Card>
        <LineChart values={[]} currency={INR} accessibilityLabel="No balance data" />
      </Section>

      <Section title="Empty and error states">
        <EmptyState icon="transactions" title="No transactions yet" body="Add one by hand or import a CSV from your bank." action={{ label: 'Import CSV', icon: 'import', onPress: () => {} }} />
        <Rule />
        <ErrorState message="We could not reach the server. Check your connection and try again." onRetry={() => {}} />
      </Section>

      <Section title="Loading">
        <Skeleton width="50%" height={40} />
        <TransactionRowSkeleton />
        <TransactionRowSkeleton />
      </Section>

      <Section title="Bottom sheet">
        <Button label="Open sheet" variant="secondary" onPress={() => setSheetOpen(true)} />
        <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter transactions">
          <Text variant="body" color="textSecondary">Drag down or flick to dismiss. Tap the backdrop or the close button.</Text>
          <TextField label="Search" placeholder="Merchant or category" />
          <Button label="Apply" fullWidth onPress={() => setSheetOpen(false)} />
        </BottomSheet>
      </Section>

      <Section title="Messages">
        <UserMessage text="How much did I spend on groceries this month?" />
        <AssistantMessage
          text="You spent ₹12,412.60 on groceries in October across 11 transactions, which is ₹1,382.20 less than September. BigBasket accounts for just over half of it."
          references={[
            { id: 'r1', label: 'Groceries total, 1 to 24 October', money: { amountMinor: 1241260, currency: INR } },
            { id: 'r2', label: 'Groceries total, September', money: { amountMinor: 1379480, currency: INR } },
            { id: 'r3', label: 'BigBasket, 6 transactions', money: { amountMinor: 641140, currency: INR } },
          ]}
          onPressReference={() => {}}
        />
        <AssistantMessage text="Looking at your rent payments" streaming />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -space.md },
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  section: { gap: space.sm },
  sectionBody: { gap: space.md, paddingTop: space.xs },
  swatch: { width: 150, gap: space.xxs },
  swatchBox: { height: 40, borderRadius: 8, borderWidth: 1 },
  iconCell: { width: 72, alignItems: 'center', gap: space.xs },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  listCard: { paddingVertical: 0, gap: 0 },
});
