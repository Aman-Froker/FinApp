import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountText, BottomSheet, Button, Skeleton, Text } from '@/components';
import { loadHistory } from '@/data/ingest';
import { MIN_CARDS, summary, wrapped, type InsightLine, type Scored, type Summary } from '@/domain/insights';
import { track } from '@/lib/device';
import { formatDate, formatMoney, plural } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Page = { kind: 'insight'; insight: Scored } | { kind: 'summary'; summary: Summary };

const SHEET_LIMIT = 20;
const inr = (amountMinor: number) => formatMoney({ amountMinor, currency: 'INR' });
const day = (iso: string) => formatDate(new Date(iso));
const period = (months: number) => (months === 1 ? 'the last month' : `the last ${plural(months, 'month')}`);

export default function Wrapped() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const list = useRef<FlatList<Page>>(null);
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState<Scored | null>(null);

  const pages = useQuery({
    queryKey: ['history'],
    queryFn: loadHistory,
    select: ({ txns, recurring }): Page[] => {
      const now = new Date();
      const cards: Page[] = wrapped(txns, recurring, now).map((insight) => ({ kind: 'insight', insight }));
      return cards.length < MIN_CARDS ? [...cards, { kind: 'summary', summary: summary(txns, now) }] : cards;
    },
  }).data;

  const current = pages?.[index];
  useEffect(() => {
    if (current) track('insight_viewed', { type: current.kind === 'insight' ? current.insight.type : 'summary', position: index + 1 });
  }, [current, index]);

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  const last = !!pages && index >= pages.length - 1;
  const next = () => (last ? router.push('/onboarding/notify') : list.current?.scrollToIndex({ index: index + 1 }));

  const act = (i: Scored) => {
    track('insight_action_taken', { type: i.type });
    if (i.type === 'runway') router.push('/onboarding/notify');
    else setSheet(i);
  };

  if (!pages) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingHorizontal: space.lg }]}>
        <Skeleton height={480} round={radius.lg} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.progress} accessible accessibilityLabel={`Card ${index + 1} of ${pages.length}`}>
        {pages.map((p, i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i <= index ? colors.accent : colors.rule }]} />
        ))}
      </View>
      <FlatList
        ref={list}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSettle}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(p) => (p.kind === 'insight' ? p.insight.type : 'summary')}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            <ScrollView style={[styles.card, { backgroundColor: colors.accentSoft }]} contentContainerStyle={styles.cardContent}>
              {item.kind === 'insight' ? <InsightBody insight={item.insight} /> : <SummaryBody summary={item.summary} />}
            </ScrollView>
          </View>
        )}
      />
      <View style={styles.actions}>
        {current?.kind === 'insight' ? <Button label={actionLabel(current.insight)} variant="secondary" fullWidth onPress={() => act(current.insight)} /> : null}
        <Button label={last ? 'Continue' : 'Next'} fullWidth onPress={next} />
      </View>
      <BottomSheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet ? actionLabel(sheet) : undefined}>
        {sheet ? <Lines lines={sheet.lines} /> : null}
      </BottomSheet>
    </View>
  );
}

function actionLabel(i: Scored): string {
  switch (i.type) {
    case 'habit':
      return 'See every order';
    case 'runway':
      return 'Turn on the daily number';
    case 'fees':
      return 'See each charge';
    case 'autopays':
      return 'Review the list';
    case 'limbo':
      return 'See each one';
    case 'creep':
      return 'See what grew';
  }
}

function InsightBody({ insight: i }: { insight: Scored }) {
  switch (i.type) {
    case 'habit':
      return <Body overline={`Your ${i.name} habit`} figure={<Amount minor={i.totalMinor} />} body={`On ${i.merchants.join(' and ')} in ${period(i.months)}.`} />;
    case 'runway':
      return (
        <Body
          overline="Salary runway"
          figure={<Figure>{day(i.runOutDate)}</Figure>}
          body={`Last month your salary lasted until ${day(i.runOutDate)}. The next one arrived on ${day(i.nextSalaryDate)}.`}
        />
      );
    case 'fees':
      return (
        <Body
          overline="Bank and card charges"
          figure={<Amount minor={i.totalMinor} />}
          body={`Taken in ${period(i.months)}. Banks often reverse a charge if you ask.`}
        />
      );
    case 'autopays':
      return <Body overline={plural(i.count, 'active autopay')} figure={<Amount minor={i.yearlyMinor} />} body="A year, at what they charge today." />;
    case 'limbo':
      return <Body overline="Money in limbo" figure={<Amount minor={i.totalMinor} />} body={`In ${plural(i.lines.length, 'failed payment')} with no refund we can see yet.`} />;
    case 'creep':
      return (
        <Body
          overline="Spending creep"
          figure={<Figure>{`${i.percent}% more`}</Figure>}
          body={`You spend ${inr(i.recentMinor)} a month now, up from ${inr(i.earlierMinor)} in the three months before.`}
        />
      );
  }
}

function SummaryBody({ summary: s }: { summary: Summary }) {
  if (!s.totalMinor) {
    return <Body overline="Your year in money" figure={<Figure>Nothing yet</Figure>} body="We found no spending in your bank messages yet." />;
  }
  return (
    <Body overline="Your year in money" figure={<Amount minor={s.totalMinor} />} body={`Spent in ${period(s.months)}. Most of it went to:`}>
      <Lines lines={s.top} />
    </Body>
  );
}

function Body({ overline, figure, body, children }: { overline: string; figure: ReactNode; body: string; children?: ReactNode }) {
  return (
    <>
      <Text variant="label" color="textSecondary">
        {overline}
      </Text>
      {figure}
      <Text variant="prose" color="textSecondary">
        {body}
      </Text>
      {children}
    </>
  );
}

const Amount = ({ minor }: { minor: number }) => <AmountText money={{ amountMinor: minor, currency: 'INR' }} size="display" />;
const Figure = ({ children }: { children: string }) => (
  <Text variant="display" tabular>
    {children}
  </Text>
);

function Lines({ lines }: { lines: InsightLine[] }) {
  return (
    <View style={styles.gap}>
      {lines.slice(0, SHEET_LIMIT).map((l) => (
        <View key={l.id} style={styles.line}>
          <View style={styles.grow}>
            <Text variant="body" numberOfLines={1}>
              {l.label}
            </Text>
            {l.date ? (
              <Text variant="caption" color="textSecondary">
                {day(l.date)}
              </Text>
            ) : null}
          </View>
          <AmountText money={{ amountMinor: l.amountMinor, currency: 'INR' }} />
        </View>
      ))}
      {lines.length > SHEET_LIMIT ? (
        <Text variant="caption" color="textSecondary">
          {`And ${(lines.length - SHEET_LIMIT).toLocaleString('en-IN')} more`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progress: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.lg },
  segment: { flex: 1, height: 4, borderRadius: radius.full },
  page: { paddingHorizontal: space.lg },
  card: { flex: 1, borderRadius: radius.lg },
  cardContent: { flexGrow: 1, padding: space.xl, gap: space.md, justifyContent: 'center' },
  actions: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  gap: { gap: space.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  grow: { flex: 1, minWidth: 0 },
});
