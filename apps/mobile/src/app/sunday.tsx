import { CATEGORIES, type Category } from '@finapp/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { AmountText, BottomSheet, Button, Card, Chip, EmptyState, GoalJar, ScreenHeader, Skeleton, Slider, StepScreen, Text, TextField, TransactionRow } from '@/components';
import { jarFor, saveSideAnswers, saveWeek, sundayState, type SideGame, type SundayState } from '@/data/game';
import { editTransaction } from '@/data/ingest';
import { saveLabels, shareLabels } from '@/data/labels';
import { loadMoney, refreshAll, type Money } from '@/data/refresh';
import { unknownSpend } from '@/domain/asks';
import type { Txn } from '@/domain/detect';
import { accuracy, categoryOf, moneyIq, spendIn, streak, weekKey } from '@/domain/game';
import { track } from '@/lib/device';
import { formatDate, formatMoney, plural } from '@/lib/format';
import { space } from '@/theme/tokens';

type Step = 'guess' | 'reveal' | 'confirm' | 'predict' | 'side' | 'done';
type Game = NonNullable<SundayState['game']>;

const inr = (amountMinor: number) => formatMoney({ amountMinor, currency: 'INR' });
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lower = (c: Category) => c.toLowerCase();

// The slider's range comes from the usual weekly spend over the 8 weeks before, never from this
// week's actual, so its middle gives nothing away.
function rangeFor(txns: Txn[], category: Category, week: Date) {
  const usual = spendIn(txns, category, addDays(week, -56), week).totalMinor / 8;
  const max = Math.ceil(Math.max(2_000_00, usual * 2.5) / 1_000_00) * 1_000_00;
  const step = max <= 5_000_00 ? 50_00 : 100_00;
  return { max, step, start: Math.round(max / 2 / step) * step };
}

export default function Sunday() {
  const money = useQuery({ queryKey: ['money'], queryFn: () => loadMoney() });
  // Read once: the game stays the same game while it is played, even after it is saved.
  const [state, setState] = useState<SundayState | null>(null);
  useEffect(() => {
    if (money.data && !state) sundayState(money.data).then(setState);
  }, [money.data, state]);

  if (!money.data || !state) {
    return (
      <StepScreen>
        <ScreenHeader title="Sunday game" />
        <Skeleton height={280} round={16} />
      </StepScreen>
    );
  }
  if (!state.game) {
    return (
      <StepScreen>
        <ScreenHeader title="Sunday game" />
        <EmptyState icon="streak" title="No game right now" body="The game opens every Sunday, about the week that is ending. See you then." />
      </StepScreen>
    );
  }
  return <Play game={state.game} state={state} money={money.data} />;
}

function Play({ game, state, money }: { game: Game; state: SundayState; money: Money }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('guess');
  const range = rangeFor(money.txns, game.category, game.week);
  const [guess, setGuess] = useState(range.start);
  const [prediction, setPrediction] = useState(range.start);
  // At the top of the range the user can double it, so a big week is never out of reach.
  const [max, setMax] = useState(range.max);
  const [fixing, setFixing] = useState<Txn | null>(null);
  const [jar, setJar] = useState(0);
  // The score is fixed at the reveal; corrections afterwards fix the data, not the score.
  const [revealed, setRevealed] = useState<{ actual: number; score: number } | null>(null);
  const [now] = useState(() => new Date());

  const end = new Date(Math.min(now.getTime(), addDays(game.week, 7).getTime()));
  const counted = spendIn(money.txns, game.category, game.week, addDays(game.week, 7));
  const actual = counted.totalMinor;
  const score = revealed?.score ?? accuracy(guess, actual);
  const period = `${formatDate(game.week)} to ${formatDate(end)}`;

  useEffect(() => {
    track('game_started', { category: game.category });
  }, [game.category]);

  const recategorise = async (t: Txn, category: Category) => {
    await editTransaction(t.id, { field: 'category', value: category });
    track('transaction_edited', { field: 'category', from: 'sunday' });
    setFixing(null);
    await queryClient.invalidateQueries({ queryKey: ['money'] });
  };

  const lockPrediction = async () => {
    const jarMinor = jarFor(state.rows, money, game.week);
    await saveWeek({
      week: weekKey(game.week),
      category: game.category,
      guessMinor: guess,
      actualMinor: actual,
      accuracy: score,
      predictionMinor: prediction,
      jarMinor,
      sideGame: game.side,
    });
    track('game_completed', { accuracy: score, category: game.category });
    setJar(jarMinor);
    setStep('side');
  };

  const finish = () => {
    void Promise.all(['money', 'sunday'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
    refreshAll().catch(() => false);
    router.back();
  };

  if (step === 'guess') {
    return (
      <StepScreen
        actions={
          <Button
            label="Lock it in"
            fullWidth
            onPress={() => {
              setRevealed({ actual, score: accuracy(guess, actual) });
              setStep('reveal');
            }}
          />
        }
      >
        <ScreenHeader title="Guess your week" />
        <Text variant="title">{`How much did you spend on ${lower(game.category)}?`}</Text>
        <Text variant="body" color="textSecondary">
          {period}
        </Text>
        <View style={styles.big}>
          <AmountText money={{ amountMinor: guess, currency: 'INR' }} size="display" />
        </View>
        <Slider value={guess} max={max} step={range.step} onChange={setGuess} accessibilityLabel={`Your guess for ${lower(game.category)}`} valueText={inr(guess)} />
        {guess >= max ? <Button variant="ghost" label={`More than ${inr(max)}`} onPress={() => setMax(max * 2)} /> : null}
      </StepScreen>
    );
  }

  if (step === 'reveal') {
    const gap = guess - actual;
    return (
      <StepScreen actions={<Button label="See what counted" fullWidth onPress={() => setStep('confirm')} />}>
        <ScreenHeader title="Guess your week" />
        <Text variant="label" color="textSecondary">
          Your accuracy
        </Text>
        <Text variant="displayLarge" tabular>{`${score}%`}</Text>
        <Card>
          <Row label="You guessed" minor={guess} />
          <Row label="You spent" minor={actual} />
          <Text variant="body" color="textSecondary">
            {gap === 0
              ? 'Spot on.'
              : `${inr(Math.abs(gap))} ${gap > 0 ? 'over' : 'under'} what you spent${actual ? `, ${Math.round((100 * Math.abs(gap)) / actual)}% out` : ''}.`}
          </Text>
        </Card>
      </StepScreen>
    );
  }

  if (step === 'confirm') {
    return (
      <StepScreen actions={<Button label="Looks right" fullWidth onPress={() => setStep('predict')} />}>
        <ScreenHeader title="What counted" />
        <Text variant="body" color="textSecondary">
          {counted.txns.length
            ? `${plural(counted.txns.length, 'payment')} counted as ${lower(game.category)}. Tap one that is something else.`
            : `Nothing counted as ${lower(game.category)} this week.`}
        </Text>
        <Card style={styles.list}>
          {counted.txns.map((t) => (
            <TransactionRow
              key={t.id}
              merchant={t.counterparty ?? t.counterpartyVpa ?? 'Unknown payee'}
              date={new Date(t.date)}
              money={{ amountMinor: -t.amountMinor, currency: 'INR' }}
              onPress={() => setFixing(t)}
            />
          ))}
        </Card>
        <BottomSheet visible={!!fixing} onClose={() => setFixing(null)} title="What was this?">
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={fixing ? categoryOf(fixing) === c : false} onPress={() => fixing && recategorise(fixing, c)} />
            ))}
          </View>
        </BottomSheet>
      </StepScreen>
    );
  }

  if (step === 'predict') {
    return (
      <StepScreen actions={<Button label="Set my target" fullWidth onPress={lockPrediction} />}>
        <ScreenHeader title="Next week" />
        <Text variant="title">{`What will you spend on ${lower(game.category)} next week?`}</Text>
        <Text variant="body" color="textSecondary">
          It becomes a soft target on your home screen. Come in under it and the difference goes into your goal jar.
        </Text>
        <View style={styles.big}>
          <AmountText money={{ amountMinor: prediction, currency: 'INR' }} size="display" />
        </View>
        <Slider value={prediction} max={max} step={range.step} onChange={setPrediction} accessibilityLabel={`Your target for ${lower(game.category)} next week`} valueText={inr(prediction)} />
        {prediction >= max ? <Button variant="ghost" label={`More than ${inr(max)}`} onPress={() => setMax(max * 2)} /> : null}
      </StepScreen>
    );
  }

  if (step === 'side') {
    return <SideGameStep game={game} money={money} now={now} onDone={() => setStep('done')} />;
  }

  const accuracies = [...state.rows.filter((r) => r.week !== weekKey(game.week)).map((r) => r.accuracy), score];
  const iq = moneyIq(accuracies)!;
  const run = streak([...state.rows.map((r) => r.week), weekKey(game.week)], now);
  const goal = money.goal;
  const share = async () => {
    track('share_card_created', { accuracy: score });
    // Accuracy and level only: a share card never shows an amount.
    await Share.share({ message: `I guessed my ${lower(game.category)} spend this week with ${score}% accuracy. My Money IQ is ${iq.score}, level ${iq.level}. Fin App` });
  };

  return (
    <StepScreen
      actions={
        <>
          <Button label="Share my score" variant="secondary" fullWidth onPress={share} />
          <Button label="Done" fullWidth onPress={finish} />
        </>
      }
    >
      <ScreenHeader title="This Sunday" />
      <Card style={styles.shareCard} accessibilityLabel={`Share card: ${score}% accurate on ${lower(game.category)}, Money IQ ${iq.score}`}>
        <Text variant="label" color="textSecondary">
          Money IQ
        </Text>
        <Text variant="displayLarge" tabular>
          {String(iq.score)}
        </Text>
        <Text variant="body">{`Level ${iq.level} · ${score}% accurate on ${lower(game.category)} this week`}</Text>
        <Text variant="caption" color="textSecondary">
          {run.weeks > 1 ? `${plural(run.weeks, 'Sunday')} in a row${run.frozen ? `, with a freeze for a missed week` : ''}` : 'Your first Sunday. Come back next week to start a streak.'}
        </Text>
      </Card>
      {goal && jar > 0 ? (
        <View style={styles.jar}>
          <GoalJar
            from={state.jarMinor / goal.amountMinor}
            to={(state.jarMinor + jar) / goal.amountMinor}
            accessibilityLabel={`${goal.name} jar, ${inr(state.jarMinor + jar)} of ${inr(goal.amountMinor)}`}
          />
          <Text variant="body" align="center">{`${inr(jar)} under last week's target moves into your ${goal.name} jar.`}</Text>
          <Text variant="caption" color="textSecondary" align="center">
            A picture of your progress: no money moves.
          </Text>
        </View>
      ) : null}
    </StepScreen>
  );
}

function Row({ label, minor }: { label: string; minor: number }) {
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.grow}>
        {label}
      </Text>
      <AmountText money={{ amountMinor: minor, currency: 'INR' }} />
    </View>
  );
}

// One side game a Sunday, rotating. Every answer is stored as training data.
function SideGameStep({ game, money, now, onDone }: { game: Game; money: Money; now: Date; onDone: () => void }) {
  const week = weekKey(game.week);
  const done = async (side: SideGame, answers: { subject: string; answer: string }[]) => {
    await saveSideAnswers(week, side, answers);
    onDone();
  };
  if (game.side === 'whos_this') return <WhosThis money={money} now={now} onDone={(a) => done('whos_this', a)} />;
  if (game.side === 'worth_it') return <WorthIt money={money} onDone={(a) => done('worth_it', a)} />;
  if (game.side === 'higher_lower') return <HigherLower money={money} now={now} onDone={(a) => done('higher_lower', a)} />;
  return <PlanCheck onDone={(a) => done('plan_check', a)} />;
}

type Answers = (a: { subject: string; answer: string }[]) => void;

// A side game with nothing to ask this week (no unknown payees, too little history) is skipped.
function Skip({ onDone }: { onDone: Answers }) {
  useEffect(() => onDone([]), [onDone]);
  return null;
}

function WhosThis({ money, now, onDone }: { money: Money; now: Date; onDone: Answers }) {
  const payees = unknownSpend(money.txns, now).unknownPayees;
  const [i, setI] = useState(0);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [answers, setAnswers] = useState<{ subject: string; answer: string }[]>([]);
  const p = payees[i];

  const next = async (save: boolean) => {
    const all = save && p && name.trim() ? [...answers, { subject: p.vpa, answer: name.trim() }] : answers;
    if (save && p && name.trim()) {
      const label = { vpa: p.vpa, merchantName: name.trim(), category };
      await saveLabels([label], 'user');
      shareLabels([label]).catch(() => undefined);
    }
    setAnswers(all);
    setName('');
    setCategory(null);
    if (i + 1 >= payees.length) onDone(all);
    else setI(i + 1);
  };

  if (!p) {
    return <Skip onDone={onDone} />;
  }
  return (
    <StepScreen
      actions={
        <>
          <Button label="Save and next" fullWidth disabled={!name.trim()} onPress={() => next(true)} />
          <Button label="I do not know" variant="ghost" fullWidth onPress={() => next(false)} />
        </>
      }
    >
      <ScreenHeader title="Who's this?" />
      <Text variant="caption" color="textSecondary">{`${i + 1} of ${payees.length}`}</Text>
      <Card>
        <Text variant="heading" numberOfLines={1}>
          {p.vpa}
        </Text>
        <Text variant="body" color="textSecondary">{`${plural(p.count, 'payment')}, ${inr(p.totalMinor)} in the last 3 months`}</Text>
      </Card>
      <TextField label="Name" placeholder="For example, Sharma General Store" value={name} onChangeText={setName} maxLength={60} />
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
        ))}
      </View>
    </StepScreen>
  );
}

const WORTH_IT_COUNT = 5;

function WorthIt({ money, onDone }: { money: Money; onDone: Answers }) {
  const recent = money.txns
    .filter((t) => t.direction === 'debit' && t.kind === 'spend' && t.status === 'success')
    .slice(-WORTH_IT_COUNT)
    .reverse();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<{ subject: string; answer: string }[]>([]);
  const t = recent[i];
  const answer = (worth: boolean) => {
    const all = [...answers, { subject: t!.id, answer: worth ? 'worth_it' : 'not_really' }];
    setAnswers(all);
    if (i + 1 >= recent.length) onDone(all);
    else setI(i + 1);
  };
  if (!t) {
    return <Skip onDone={onDone} />;
  }
  return (
    <StepScreen
      actions={
        <View style={styles.pair}>
          <View style={styles.grow}>
            <Button label="Not really" variant="secondary" fullWidth onPress={() => answer(false)} />
          </View>
          <View style={styles.grow}>
            <Button label="Worth it" fullWidth onPress={() => answer(true)} />
          </View>
        </View>
      }
    >
      <ScreenHeader title="Worth it?" />
      <Text variant="caption" color="textSecondary">{`${i + 1} of ${recent.length}`}</Text>
      <Card>
        <Text variant="heading" numberOfLines={2}>
          {t.counterparty ?? t.counterpartyVpa ?? 'Unknown payee'}
        </Text>
        <AmountText money={{ amountMinor: t.amountMinor, currency: 'INR' }} size="display" />
        <Text variant="body" color="textSecondary">
          {formatDate(new Date(t.date))}
        </Text>
      </Card>
      <Text variant="body" color="textSecondary">
        Only your answers decide what Fin App nudges you about. Nothing here is judged.
      </Text>
    </StepScreen>
  );
}

function HigherLower({ money, now, onDone }: { money: Money; now: Date; onDone: Answers }) {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = from.toLocaleDateString('en-IN', { month: 'long' });
  const totals = CATEGORIES.filter((c) => c !== 'Other' && c !== 'Family and friends')
    .map((c) => ({ c, minor: spendIn(money.txns, c, from, to).totalMinor }))
    .filter((x) => x.minor > 0)
    .sort((a, b) => b.minor - a.minor);
  const [picked, setPicked] = useState<Category | null>(null);
  // The two biggest, shown in a fixed order that does not give the answer away.
  const pair = totals.slice(0, 2).sort((a, b) => a.c.localeCompare(b.c));
  if (pair.length < 2) {
    return <Skip onDone={onDone} />;
  }
  const bigger = totals[0]!.c;
  return (
    <StepScreen actions={picked ? <Button label="Next" fullWidth onPress={() => onDone([{ subject: pair.map((p) => p.c).join(' vs '), answer: picked === bigger ? 'right' : 'wrong' }])} /> : undefined}>
      <ScreenHeader title="Higher or lower" />
      <Text variant="title">{`Which did you spend more on in ${month}?`}</Text>
      {pair.map((p) => (
        <Button key={p.c} label={p.c} variant={picked === p.c ? 'primary' : 'secondary'} fullWidth disabled={!!picked} onPress={() => setPicked(p.c)} />
      ))}
      {picked ? (
        <Card>
          <Text variant="heading">{picked === bigger ? 'Right.' : `Not this time: it was ${lower(bigger)}.`}</Text>
          {pair.map((p) => (
            <Row key={p.c} label={p.c} minor={p.minor} />
          ))}
        </Card>
      ) : null}
    </StepScreen>
  );
}

const PLANS = ['A trip', 'A wedding', 'A new gadget', 'Rent going up', 'None of these'];

function PlanCheck({ onDone }: { onDone: Answers }) {
  const [plans, setPlans] = useState<string[]>([]);
  const toggle = (p: string) =>
    setPlans((all) => (p === 'None of these' ? ['None of these'] : all.includes(p) ? all.filter((x) => x !== p) : [...all.filter((x) => x !== 'None of these'), p]));
  return (
    <StepScreen actions={<Button label="Done" fullWidth disabled={!plans.length} onPress={() => onDone(plans.map((p) => ({ subject: 'plan', answer: p })))} />}>
      <ScreenHeader title="Plan check" />
      <Text variant="title">Anything big coming up in the next few months?</Text>
      <Text variant="body" color="textSecondary">
        Pick any that apply. It helps Fin App plan ahead for you later.
      </Text>
      <View style={styles.chips}>
        {PLANS.map((p) => (
          <Chip key={p} label={p} selected={plans.includes(p)} onPress={() => toggle(p)} />
        ))}
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  big: { alignItems: 'center', paddingVertical: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 32 },
  grow: { flex: 1, minWidth: 0 },
  list: { paddingVertical: space.sm, gap: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
  shareCard: { alignItems: 'flex-start' },
  jar: { alignItems: 'center', gap: space.sm, paddingTop: space.md },
});
