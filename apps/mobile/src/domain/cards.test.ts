import type { Statement } from './alerts';
import { cardsFrom } from './cards';
import type { Txn } from './detect';

let n = 0;
const txn = (date: string, amountMinor: number, over: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  date: new Date(date).toISOString(),
  amountMinor,
  direction: 'debit',
  kind: 'spend',
  status: 'success',
  instrument: 'card',
  accountLast4: '5678',
  counterparty: 'AMAZON',
  counterpartyVpa: null,
  ...over,
});
const statement = (id: string, receivedAt: string, dueDate: string): Statement => ({ id, accountLast4: '5678', totalDueMinor: 18_450_00, minDueMinor: 920_00, dueDate, receivedAt: new Date(receivedAt).toISOString() });

test('a card collects its statements once each, newest first, and its spends since the latest', () => {
  const statements = [statement('sms:1', '2026-10-15T09:00:00', '2026-11-05'), statement('email:1', '2026-10-15T10:00:00', '2026-11-05'), statement('sms:0', '2026-09-15T09:00:00', '2026-10-05')];
  const txns = [txn('2026-10-10T12:00:00', 1_000_00), txn('2026-10-20T12:00:00', 2_340_00), txn('2026-10-21T12:00:00', 500_00, { accountLast4: '1005' })];
  const [first, second] = cardsFrom(statements, txns);
  expect(first!.last4).toBe('1005');
  expect(second!.statements.map((s) => s.dueDate)).toEqual(['2026-11-05', '2026-10-05']);
  expect(second!.spentSinceMinor).toBe(2_340_00);
});

test('a statement is paid once a card payment of at least the minimum follows it', () => {
  const s = statement('sms:1', '2026-10-15T09:00:00', '2026-11-05');
  const payment = txn('2026-10-25T09:00:00', 920_00, { kind: 'transfer', instrument: 'upi', counterparty: 'HDFC Bank Credit Card' });
  expect(cardsFrom([s], [])[0]!.statements[0]!.paid).toBe(false);
  expect(cardsFrom([s], [payment])[0]!.statements[0]!.paid).toBe(true);
});
