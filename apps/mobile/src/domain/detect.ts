// Pure money logic over parsed transactions. No database, no React: everything here is tested.

export type Kind = 'spend' | 'income' | 'transfer' | 'fee' | 'refund';

export type Txn = {
  id: string;
  date: string;
  amountMinor: number;
  direction: 'debit' | 'credit';
  kind: Kind;
  status: string;
  instrument: string;
  accountLast4: string | null;
  counterparty: string | null;
  counterpartyVpa: string | null;
  // Set by the user: a refund is due for this debit (SQLite gives 0 or 1).
  refundExpected?: number | boolean;
  // From a label or the user's own recategorising; null when only brand rules can tell.
  category?: string | null;
  // 'user' when the user changed how it counts; their choice always wins.
  source?: string;
};

const DAY = 86_400_000;
const time = (t: Txn) => Date.parse(t.date);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

const RAIL: Record<string, string> = { upi: 'UPI', nach: 'Autopay', imps: 'IMPS', neft: 'NEFT', card: 'Card' };

// What to call the other side. When the message named nobody, the UPI ID, then how and where the
// money moved, so a row never just says "Unknown".
export function payeeOf(t: Pick<Txn, 'counterparty' | 'counterpartyVpa' | 'direction' | 'instrument' | 'accountLast4'>): string {
  if (t.counterparty) return t.counterparty;
  if (t.counterpartyVpa) return t.counterpartyVpa;
  const debit = t.direction === 'debit';
  const account = t.accountLast4 ? ` ${debit ? 'from' : 'to'} account ending ${t.accountLast4}` : '';
  if (t.instrument === 'atm') return `Cash withdrawal${account}`;
  if (t.instrument === 'card' && debit && t.accountLast4) return `Card ending ${t.accountLast4}`;
  const rail = RAIL[t.instrument];
  return rail ? `${rail} ${debit ? 'payment' : 'credit'}${account}` : `${debit ? 'Payment' : 'Credit'}${account}`;
}

// Paying the card bill, not spending on the card: "Spent INR 1,047 using Axis Bank Credit Card" is spending.
const CARD_BILL = /\b(?:payment|paid)\b.{0,60}?\btowards\b.{0,40}?\bcredit\s*card\b|\bcredit\s*card\s*(?:bill|payment)\b|\bcard\s*bill\b|\bcc\s*(?:bill|payment)\b|\bvia\s+cred\b|\bpayment received\b/i;
// A fee is named for what it is. "No further charges will be made" or "zero convenience fee" only
// mentions charges in passing, so those phrases are removed before looking.
const NOT_A_FEE = /\b(?:no|zero|without(?:\s+any)?)\s+(?:further\s+|extra\s+|additional\s+|convenience\s+|processing\s+)?(?:charges?|fees?)\b|\bcharges?\s+(?:will\s+not|won't|shall\s+not)\b/gi;
const FEE =
  /\b(?:annual|joining|renewal|late(?:\s+payment)?|processing|convenience|over-?limit|cash\s+advance|forex|mark-?up|cheque\s+(?:return|bounce)|(?:ecs|nach|si)\s+(?:return|bounce)|bounce|sms(?:\s+alert)?|alert|debit\s+card|atm|non[-\s]?maintenance|service|amc|locker|stamp\s+duty)\s+(?:fees?|charges?)\b|\bgst\s+(?:on|@)|\bpenal(?:ty|\s+(?:charges?|interest))\b|\b(?:finance|interest)\s+charges?\b/i;

// Money the message itself says went to the user's own account.
const SELF = /\b(?:to|from)\s+self\b|\bself[-\s]?(?:transfer|trf|a\/c)\b|\bown\s+(?:a\/c|accounts?)\b/i;

// Kind from one message on its own. Pairing across messages happens in pairSelfTransfers.
export function kindOf(direction: 'debit' | 'credit', status: string, body: string): Kind {
  if (status === 'refund') return 'refund';
  if (CARD_BILL.test(body) || SELF.test(body)) return 'transfer';
  if (direction === 'debit' && FEE.test(body.replace(NOT_A_FEE, ' '))) return 'fee';
  return direction === 'credit' ? 'income' : 'spend';
}

const keyOf = (t: Txn) => (t.counterparty ?? t.counterpartyVpa ?? '').toLowerCase().replace(/[^a-z0-9@]/g, '');
const PAIR_WINDOW = 2 * 60 * 60_000;
const words = (name: string | null) => (name ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
// Both sides of a move between the user's own accounts carry the user's own name: every word of the
// shorter form is in the longer ("AMAN K" and "Mr AMAN KUMAR"), so a shared surname alone is not enough.
const sameName = (a: Txn, b: Txn) => {
  const [short, long] = [words(a.counterparty), words(b.counterparty)].sort((x, y) => x.length - y.length);
  return short!.length > 0 && short!.every((w) => long!.includes(w));
};

// The names and UPI IDs the user said are their own, by marking a payment to one as a transfer.
export const ownKeys = (txns: Txn[]) => new Set(txns.filter((t) => t.source === 'user' && t.kind === 'transfer').map(keyOf).filter(Boolean));

// A debit from one of the user's accounts and a credit of the same amount into another within two
// hours (NEFT can take that long) is money moving between their own accounts. When both sides name
// the same person, that name is the user's, so later payments to it are transfers too, as are
// payments to the user's own names in `own`, unless the user counted one as spending or money in.
// Rows the user edited are never touched.
export function pairSelfTransfers(txns: Txn[], own: Set<string> = new Set()): Set<string> {
  const paired = new Set<string>();
  const learned = new Set(own);
  const movable = txns.filter((t) => t.status === 'success' && t.source !== 'user' && (t.kind === 'transfer' || t.kind === (t.direction === 'debit' ? 'spend' : 'income')));
  const credits = movable.filter((t) => t.direction === 'credit' && t.accountLast4);
  for (const d of movable) {
    if (d.direction !== 'debit' || !d.accountLast4) continue;
    const near = credits
      .filter((c) => !paired.has(c.id) && c.amountMinor === d.amountMinor && c.accountLast4 !== d.accountLast4 && Math.abs(time(c) - time(d)) <= PAIR_WINDOW)
      .sort((a, b) => Math.abs(time(a) - time(d)) - Math.abs(time(b) - time(d)));
    const c = near[0];
    if (!c) continue;
    paired.add(d.id);
    paired.add(c.id);
    if (sameName(d, c)) for (const k of [keyOf(d), keyOf(c)]) if (k) learned.add(k);
  }
  for (const t of txns) if (t.source === 'user' && t.kind !== 'transfer') learned.delete(keyOf(t));
  for (const t of movable) if (learned.has(keyOf(t))) paired.add(t.id);
  // Only rows that still count as spending or money in need changing.
  return new Set([...paired].filter((id) => txns.find((t) => t.id === id)!.kind !== 'transfer'));
}

// 'repeat' is a regular payment the user makes by hand, such as a weekly UPI to the same shop.
export type RecurringType = 'salary' | 'income' | 'emi' | 'sip' | 'rent' | 'autopay' | 'subscription' | 'repeat';

export type Recurring = {
  key: string;
  label: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  cadence: 'monthly' | 'weekly';
  lastSeen: string;
  nextDue: string;
  type: RecurringType;
  // Taken without the user acting: a mandate, NACH, AutoPay or standing instruction, or a known subscription service.
  automatic: boolean;
  accountLast4: string | null;
  txnIds: string[];
};

const UNNAMED = 'unnamed:';

// Services that only charge by subscription, so a repeat payment to one is one.
const SUBSCRIPTION =
  /netflix|spotify|youtube|google\s*(?:play|one|storage)|apple\s*(?:com|services|music)|icloud|prime\s*video|amazon\s*prime|hotstar|jiocinema|zee5|sonyliv|sony\s*liv|audible|linkedin|microsoft|adobe|openai|chatgpt|notion|canva|dropbox|crunchyroll|jiosaavn|wynk|gaana/i;

function typeOf(label: string, direction: 'debit' | 'credit', instrument: string): RecurringType {
  if (direction === 'credit') return /salary|\bsal\b|payroll/i.test(label) ? 'salary' : 'income';
  if (/\bemi\b|loan/i.test(label)) return 'emi';
  if (/\bsip\b|mutual fund|\bmf\b|groww|zerodha|kuvera/i.test(label)) return 'sip';
  if (/\brent\b/i.test(label)) return 'rent';
  if (SUBSCRIPTION.test(label)) return 'subscription';
  if (instrument === 'nach') return 'autopay';
  return 'repeat';
}

// Same counterparty, amount within 10 percent, repeating 25 to 35 days apart (monthly) or 6 to 8
// days apart (weekly). NACH debits count from the first occurrence, as the PRD specifies.
export function detectRecurring(txns: Txn[]): Recurring[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.status !== 'success' || (t.kind !== 'spend' && t.kind !== 'income' && t.kind !== 'transfer')) continue;
    // A credit with no payer (common for NEFT salaries) is grouped by the account and rail it came in on.
    const k = keyOf(t) || (t.direction === 'credit' && t.accountLast4 ? `${UNNAMED}${t.accountLast4}:${t.instrument}` : '');
    if (!k) continue;
    const g = `${t.direction}:${k}`;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }

  const out: Recurring[] = [];
  for (const [key, all] of groups) {
    const sorted = all.sort((a, b) => time(a) - time(b));
    const unnamed = key.includes(UNNAMED);
    // A named payee is compared with its latest amount, so a price change is followed rather than
    // averaged away. An unnamed group mixes unrelated credits, so its typical amount is the one most
    // of the others sit near.
    const nearTo = (typical: number) => sorted.filter((t) => Math.abs(t.amountMinor - typical) <= typical * 0.1);
    const typical = unnamed
      ? sorted.reduce((best, t) => (nearTo(t.amountMinor).length > nearTo(best).length ? t.amountMinor : best), sorted.at(-1)!.amountMinor)
      : sorted.at(-1)!.amountMinor;
    const near = nearTo(typical);
    const gaps = near.slice(1).map((t, i) => (time(t) - time(near[i]!)) / DAY);
    const monthly = gaps.filter((g) => g >= 25 && g <= 35).length;
    const weekly = gaps.filter((g) => g >= 6 && g <= 8).length;
    const first = near[0]!;
    const last = near.at(-1)!;
    let cadence: 'monthly' | 'weekly' | null = null;
    if (monthly >= 1 && monthly >= gaps.length / 2) cadence = 'monthly';
    else if (weekly >= 1 && weekly >= gaps.length / 2) cadence = 'weekly';
    else if (first.instrument === 'nach' && first.direction === 'debit') cadence = 'monthly';
    if (!cadence) continue;

    const label = last.counterparty ?? last.counterpartyVpa ?? (unnamed && last.accountLast4 ? `Credits to account ending ${last.accountLast4}` : key);
    const step = cadence === 'weekly' ? 7 * DAY : 0;
    const next = new Date(time(last) + step);
    if (cadence === 'monthly') next.setMonth(next.getMonth() + 1);
    out.push({
      key,
      label,
      direction: last.direction,
      amountMinor: median(near.slice(-3).map((t) => t.amountMinor)),
      cadence,
      lastSeen: last.date,
      nextDue: next.toISOString(),
      type: typeOf(label, last.direction, last.instrument),
      automatic: last.direction === 'debit' && (near.some((t) => t.instrument === 'nach') || SUBSCRIPTION.test(label)),
      accountLast4: last.accountLast4,
      txnIds: near.map((t) => t.id),
    });
  }
  return out;
}

export type Salary = {
  key: string;
  amountMinor: number;
  payDay: number;
  label: string;
  lastSeen: string;
  txnIds: string[];
  // False when the money coming in each month does not point to one credit, so the user is asked.
  sure: boolean;
};

const MIN_SALARY_MINOR = 10_000_00;
const RECENT_SALARY = 45 * DAY;
const isIncome = (t: Txn) => t.direction === 'credit' && t.kind === 'income' && t.status === 'success';
// Days apart within a month, so the 30th and the 1st are two days apart.
const dayGap = (a: number, b: number) => Math.min(Math.abs(a - b), 31 - Math.abs(a - b));
const biggest = <T extends { amountMinor: number }>(xs: T[]) => xs.reduce((a, b) => (b.amountMinor > a.amountMinor ? b : a));

const fromRecurring = (r: Recurring, sure: boolean): Salary => ({
  key: r.key,
  amountMinor: r.amountMinor,
  payDay: new Date(r.lastSeen).getDate(),
  label: r.label,
  lastSeen: r.lastSeen,
  txnIds: r.txnIds,
  sure,
});

// The largest credit of each of the last three full months. When they agree on amount (within 10
// percent) and day of the month (within 5 days), that is the salary, whatever the payer is called.
function steadyLargest(txns: Txn[], now: Date): Salary | null {
  const income = txns.filter((t) => isIncome(t) && t.amountMinor >= MIN_SALARY_MINOR).sort((a, b) => time(a) - time(b));
  const months = [3, 2, 1].map((i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString()));
  const largest = months.flatMap((m) => {
    const inMonth = income.filter((t) => monthKey(t.date) === m);
    return inMonth.length ? [biggest(inMonth)] : [];
  });
  if (largest.length < 2) return null;
  const typical = median(largest.map((t) => t.amountMinor));
  const near = (t: Txn) => Math.abs(t.amountMinor - typical) <= typical * 0.1;
  const day = (t: Txn) => new Date(t.date).getDate();
  if (!largest.every((t) => near(t) && dayGap(day(t), day(largest[0]!)) <= 5)) return null;
  // This month's one counts too once it has arrived.
  const current = income.filter((t) => monthKey(t.date) === monthKey(now.toISOString()) && near(t) && dayGap(day(t), day(largest.at(-1)!)) <= 5);
  const series = [...largest, ...current.slice(-1)];
  const last = series.at(-1)!;
  if (now.getTime() - time(last) > RECENT_SALARY) return null;
  const names = new Set(series.map(payeeOf));
  return {
    key: 'largest-credit',
    amountMinor: median(series.slice(-3).map((t) => t.amountMinor)),
    payDay: day(last),
    label: names.size === 1 ? payeeOf(last) : 'Largest credit each month',
    lastSeen: last.date,
    txnIds: series.map((t) => t.id),
    sure: true,
  };
}

const recentMonthlyCredits = (recurring: Recurring[], now: Date) =>
  recurring.filter(
    (r) =>
      r.direction === 'credit' &&
      r.cadence === 'monthly' &&
      r.amountMinor >= MIN_SALARY_MINOR &&
      now.getTime() - Date.parse(r.lastSeen) <= RECENT_SALARY,
  );

// One that says salary wins; then the largest credit when it is steady month to month; then the
// largest monthly credit, which is only sure when nothing else could be the salary.
export function detectSalary(txns: Txn[], recurring: Recurring[], now: Date): Salary | null {
  const recent = recentMonthlyCredits(recurring, now);
  const named = recent.filter((r) => r.type === 'salary');
  if (named.length) return fromRecurring(biggest(named), true);
  const steady = steadyLargest(txns, now);
  if (steady) return steady;
  if (!recent.length) return null;
  const best = biggest(recent);
  return fromRecurring(best, salaryChoices(txns, recurring, now).length === 1);
}

const MAX_CHOICES = 5;

// What the user picks from when the salary is not sure: every recent monthly credit, and the large
// one-off credits of the last 45 days, largest first.
export function salaryChoices(txns: Txn[], recurring: Recurring[], now: Date): Salary[] {
  const groups = recentMonthlyCredits(recurring, now).map((r) => fromRecurring(r, false));
  const grouped = new Set(groups.flatMap((g) => g.txnIds));
  const single = txns
    .filter((t) => isIncome(t) && t.amountMinor >= MIN_SALARY_MINOR && !grouped.has(t.id) && now.getTime() - time(t) <= RECENT_SALARY)
    .map((t): Salary => ({ key: `txn:${t.id}`, amountMinor: t.amountMinor, payDay: new Date(t.date).getDate(), label: payeeOf(t), lastSeen: t.date, txnIds: [t.id], sure: false }));
  return [...groups, ...single].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, MAX_CHOICES);
}

export type BudgetLine = { label: string; amountMinor: number; txnIds: string[] };

export type BudgetProposal = {
  basis: 'salary' | 'spend';
  amountMinor: number;
  resetDay: number;
  lines: BudgetLine[];
};

// The phone's calendar month (YYYY-MM). Slicing the ISO string would give the UTC month, which puts
// payments made before 05:30 IST on the 1st into the month before.
export const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// The monthly budget the app proposes after the scan. Every line names the transactions it came
// from, so the screen can show exactly what the figure is made of. Null when history is too short.
// The salary is the detected one unless the user picked another, or null when they said none is.
export function proposeBudget(
  txns: Txn[],
  recurring: Recurring[],
  now: Date,
  salary: Salary | null = detectSalary(txns, recurring, now),
): BudgetProposal | null {
  if (salary) {
    const lastThree = new Set([0, 1, 2].map((i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString())));
    const other = recurring.filter((r) => {
      if (r.direction !== 'credit' || r.txnIds.some((id) => salary.txnIds.includes(id))) return false;
      const months = new Set(txns.filter((t) => r.txnIds.includes(t.id)).map((t) => monthKey(t.date)).filter((m) => lastThree.has(m)));
      return months.size >= 2;
    });
    const lines: BudgetLine[] = [
      { label: salary.label, amountMinor: salary.amountMinor, txnIds: salary.txnIds },
      ...other.map((r) => ({ label: r.label, amountMinor: r.amountMinor, txnIds: r.txnIds })),
    ];
    return { basis: 'salary', amountMinor: lines.reduce((s, l) => s + l.amountMinor, 0), resetDay: salary.payDay, lines };
  }

  // No salary: median spend of the last full months, up to six.
  const totals = new Map<string, { sum: number; ids: string[] }>();
  const thisMonth = monthKey(now.toISOString());
  for (const t of txns) {
    if (t.kind !== 'spend' || t.status !== 'success') continue;
    const m = monthKey(t.date);
    if (m >= thisMonth) continue;
    const e = totals.get(m) ?? { sum: 0, ids: [] };
    e.sum += t.amountMinor;
    e.ids.push(t.id);
    totals.set(m, e);
  }
  const months = [...totals.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);
  if (!months.length) return null;
  return {
    basis: 'spend',
    amountMinor: median(months.map(([, e]) => e.sum)),
    resetDay: 1,
    lines: months.map(([m, e]) => ({ label: m, amountMinor: e.sum, txnIds: e.ids })),
  };
}
