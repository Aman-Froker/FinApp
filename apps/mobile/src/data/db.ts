import * as SQLite from 'expo-sqlite';

const NAME = 'finapp.db';

// Append only: each entry runs once, in order, tracked by PRAGMA user_version.
const MIGRATIONS = [
  `CREATE TABLE sms_raw (
     id TEXT PRIMARY KEY,
     sender TEXT NOT NULL,
     body TEXT NOT NULL,
     receivedAt TEXT NOT NULL,
     parsedStatus TEXT NOT NULL CHECK (parsedStatus IN ('parsed', 'unparsed')),
     rule TEXT,
     templateKey TEXT NOT NULL
   );
   CREATE TABLE transactions (
     id TEXT PRIMARY KEY,
     smsId TEXT UNIQUE REFERENCES sms_raw(id) ON DELETE CASCADE,
     date TEXT NOT NULL,
     amountMinor INTEGER NOT NULL,
     direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
     kind TEXT NOT NULL CHECK (kind IN ('spend', 'income', 'transfer', 'fee', 'refund')),
     status TEXT NOT NULL,
     instrument TEXT NOT NULL,
     accountLast4 TEXT,
     counterparty TEXT,
     counterpartyVpa TEXT,
     balanceAfterMinor INTEGER,
     referenceNo TEXT,
     category TEXT,
     source TEXT NOT NULL CHECK (source IN ('rule', 'llm', 'user')),
     rule TEXT,
     createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX transactions_date ON transactions(date DESC);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // When an unparsed message was sent to the server fallback, so it is sent at most once.
  `ALTER TABLE sms_raw ADD COLUMN fallbackAt TEXT;`,
  // The budget envelope: one row, proposed from the scan and accepted or edited by the user.
  `CREATE TABLE salary (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     amountMinor INTEGER NOT NULL CHECK (amountMinor > 0),
     payDay INTEGER NOT NULL CHECK (payDay BETWEEN 1 AND 31),
     source TEXT NOT NULL CHECK (source IN ('detected', 'user')),
     confirmedAt TEXT NOT NULL
   );`,
  // M3: user edits to transactions with their audit trail, and every alert planned, sent or suppressed.
  `ALTER TABLE transactions ADD COLUMN refundExpected INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE txn_edits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     txnId TEXT NOT NULL,
     field TEXT NOT NULL,
     fromValue TEXT,
     toValue TEXT,
     at TEXT NOT NULL
   );
   CREATE TABLE alerts (
     key TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     fireAt TEXT NOT NULL,
     txnIds TEXT NOT NULL,
     suppressed INTEGER NOT NULL DEFAULT 0
   );`,
  // M4: names for UPI IDs (from the user, UPI app notifications or the shared map), the give-to-get
  // asks and the one goal.
  `CREATE TABLE labels (
     vpa TEXT PRIMARY KEY,
     merchantName TEXT NOT NULL,
     category TEXT,
     labelledBy TEXT NOT NULL CHECK (labelledBy IN ('user', 'notification', 'shared')),
     updatedAt TEXT NOT NULL
   );
   CREATE TABLE vpa_lookups (vpa TEXT PRIMARY KEY, at TEXT NOT NULL);
   CREATE TABLE asks (
     type TEXT PRIMARY KEY,
     shownAt TEXT,
     acceptedAt TEXT,
     declinedAt TEXT,
     declinedTrigger TEXT
   );
   CREATE TABLE goal (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     name TEXT NOT NULL,
     amountMinor INTEGER NOT NULL CHECK (amountMinor > 0),
     targetDate TEXT NOT NULL,
     createdAt TEXT NOT NULL
   );`,
  // M5: one row per Sunday game (its guess, the actual, and the prediction for the week after) and
  // the side game answers, all kept as training data.
  `CREATE TABLE game_weeks (
     week TEXT PRIMARY KEY,
     category TEXT NOT NULL,
     guessMinor INTEGER NOT NULL,
     actualMinor INTEGER NOT NULL,
     accuracy INTEGER NOT NULL,
     predictionMinor INTEGER,
     jarMinor INTEGER NOT NULL DEFAULT 0,
     sideGame TEXT,
     playedAt TEXT NOT NULL
   );
   CREATE TABLE side_answers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     week TEXT NOT NULL,
     game TEXT NOT NULL,
     subject TEXT NOT NULL,
     answer TEXT NOT NULL,
     answeredAt TEXT NOT NULL
   );`,
  // M6: card statements from forwarded emails (SMS statements stay in sms_raw and are read from there).
  `CREATE TABLE card_statements (
     id TEXT PRIMARY KEY,
     accountLast4 TEXT,
     totalDueMinor INTEGER NOT NULL,
     minDueMinor INTEGER,
     dueDate TEXT NOT NULL,
     receivedAt TEXT NOT NULL
   );`,
];

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  opening ??= open();
  return opening;
}

async function open() {
  const db = await SQLite.openDatabaseAsync(NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]!);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await (await getDb()).getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await getDb()).runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

export type SalaryRow = { amountMinor: number; payDay: number; source: 'detected' | 'user'; confirmedAt: string };

export async function getSalary(): Promise<SalaryRow | null> {
  return (await getDb()).getFirstAsync<SalaryRow>('SELECT amountMinor, payDay, source, confirmedAt FROM salary WHERE id = 1');
}

export async function setSalary(amountMinor: number, payDay: number, source: SalaryRow['source']): Promise<void> {
  await (await getDb()).runAsync(
    'INSERT OR REPLACE INTO salary (id, amountMinor, payDay, source, confirmedAt) VALUES (1, ?, ?, ?, ?)',
    amountMinor, payDay, source, new Date().toISOString(),
  );
}

export type GoalRow = { name: string; amountMinor: number; targetDate: string };

export async function getGoal(): Promise<GoalRow | null> {
  return (await getDb()).getFirstAsync<GoalRow>('SELECT name, amountMinor, targetDate FROM goal WHERE id = 1');
}

export async function setGoal(g: GoalRow | null): Promise<void> {
  const db = await getDb();
  if (!g) await db.runAsync('DELETE FROM goal');
  else await db.runAsync('INSERT OR REPLACE INTO goal (id, name, amountMinor, targetDate, createdAt) VALUES (1, ?, ?, ?, ?)', g.name, g.amountMinor, g.targetDate, new Date().toISOString());
}

// Removes every byte the app stored on the phone.
export async function wipeLocalDb(): Promise<void> {
  if (opening) await (await opening).closeAsync();
  opening = null;
  await SQLite.deleteDatabaseAsync(NAME);
}
