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
};

const DAY = 86_400_000;
const time = (t: Txn) => Date.parse(t.date);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

const CARD_BILL = /credit\s*card|card\s*bill|cc\s*payment|\bcred\b|payment received/i;
const FEE = /\b(?:charges?|fee|gst|penalty|annual fee|sms alert)\b/i;

// Kind from one message on its own. Pairing across messages happens in pairSelfTransfers.
export function kindOf(direction: 'debit' | 'credit', status: string, body: string): Kind {
  if (status === 'refund') return 'refund';
  if (CARD_BILL.test(body)) return 'transfer';
  if (direction === 'debit' && FEE.test(body)) return 'fee';
  return direction === 'credit' ? 'income' : 'spend';
}

// A debit from one of the user's accounts and a credit of the same amount into another within
// 30 minutes is money moving between their own accounts, not spending or income.
export function pairSelfTransfers(txns: Txn[]): Set<string> {
  const paired = new Set<string>();
  const credits = txns.filter((t) => t.direction === 'credit' && t.kind === 'income' && t.accountLast4);
  for (const d of txns) {
    if (d.direction !== 'debit' || d.kind !== 'spend' || !d.accountLast4) continue;
    const match = credits.find(
      (c) =>
        !paired.has(c.id) &&
        c.amountMinor === d.amountMinor &&
        c.accountLast4 !== d.accountLast4 &&
        Math.abs(time(c) - time(d)) <= 30 * 60_000,
    );
    if (match) {
      paired.add(d.id);
      paired.add(match.id);
    }
  }
  return paired;
}

export type RecurringType = 'salary' | 'income' | 'emi' | 'sip' | 'rent' | 'autopay' | 'subscription';

export type Recurring = {
  key: string;
  label: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  cadence: 'monthly' | 'weekly';
  lastSeen: string;
  nextDue: string;
  type: RecurringType;
  accountLast4: string | null;
  txnIds: string[];
};

const keyOf = (t: Txn) => (t.counterparty ?? t.counterpartyVpa ?? '').toLowerCase().replace(/[^a-z0-9@]/g, '');

function typeOf(label: string, direction: 'debit' | 'credit', instrument: string): RecurringType {
  if (direction === 'credit') return /salary|\bsal\b|payroll/i.test(label) ? 'salary' : 'income';
  if (/\bemi\b|loan/i.test(label)) return 'emi';
  if (/\bsip\b|mutual fund|\bmf\b|groww|zerodha|kuvera/i.test(label)) return 'sip';
  if (/\brent\b/i.test(label)) return 'rent';
  if (instrument === 'nach') return 'autopay';
  return 'subscription';
}

// Same counterparty, amount within 10 percent, repeating 25 to 35 days apart (monthly) or 6 to 8
// days apart (weekly). NACH debits count from the first occurrence, as the PRD specifies.
export function detectRecurring(txns: Txn[]): Recurring[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.status !== 'success' || (t.kind !== 'spend' && t.kind !== 'income' && t.kind !== 'transfer')) continue;
    const k = keyOf(t);
    if (!k) continue;
    const g = `${t.direction}:${k}`;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }

  const out: Recurring[] = [];
  for (const [key, all] of groups) {
    const sorted = all.sort((a, b) => time(a) - time(b));
    // Compared with the latest amount, so a price change is followed rather than averaged away.
    const typical = sorted.at(-1)!.amountMinor;
    const near = sorted.filter((t) => Math.abs(t.amountMinor - typical) <= typical * 0.1);
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

    const label = last.counterparty ?? last.counterpartyVpa ?? key;
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
      accountLast4: last.accountLast4,
      txnIds: near.map((t) => t.id),
    });
  }
  return out;
}

export type Salary = { key: string; amountMinor: number; payDay: number; label: string; txnIds: string[] };

const MIN_SALARY_MINOR = 10_000_00;

// The largest monthly credit, preferring one that says salary. A one-off credit is never salary.
export function detectSalary(recurring: Recurring[], now: Date): Salary | null {
  const recent = recurring.filter(
    (r) =>
      r.direction === 'credit' &&
      r.cadence === 'monthly' &&
      r.amountMinor >= MIN_SALARY_MINOR &&
      now.getTime() - Date.parse(r.lastSeen) <= 45 * DAY,
  );
  if (!recent.length) return null;
  const best = recent.reduce((a, b) => {
    const score = (r: Recurring) => r.amountMinor * (r.type === 'salary' ? 2 : 1);
    return score(b) > score(a) ? b : a;
  });
  return {
    key: best.key,
    amountMinor: best.amountMinor,
    payDay: new Date(best.lastSeen).getDate(),
    label: best.label,
    txnIds: best.txnIds,
  };
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
export function proposeBudget(txns: Txn[], recurring: Recurring[], now: Date): BudgetProposal | null {
  const salary = detectSalary(recurring, now);
  if (salary) {
    const lastThree = new Set([0, 1, 2].map((i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString())));
    const other = recurring.filter((r) => {
      if (r.direction !== 'credit' || r.key === salary.key) return false;
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
