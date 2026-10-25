// The parser contract. Pure TypeScript: runs on the phone, the server and in tests.

export type Channel = 'sms' | 'email';

export type ParseInput = {
  sender: string;
  body: string;
  // ISO instant the message arrived.
  receivedAt: string;
  channel: Channel;
};

export type Instrument = 'upi' | 'card' | 'nach' | 'atm' | 'imps' | 'neft' | 'other';

export type ParsedTransaction = {
  type: 'debit' | 'credit';
  amountMinor: number;
  accountLast4: string | null;
  instrument: Instrument;
  counterparty: string | null;
  counterpartyVpa: string | null;
  balanceAfterMinor: number | null;
  // shortcut: the message arrival time stands in for the transaction time, bank alerts land within minutes; read the body date if statement-style alerts are added
  date: string;
  status: 'success' | 'failed' | 'refund';
  referenceNo: string | null;
  // Name of the rule that matched, for parse-rate stats per sender.
  rule: string;
};

// Fields a rule can fill; the engine adds date and rule, and defaults the rest.
export type RuleMatch = Partial<Omit<ParsedTransaction, 'date' | 'rule'>> &
  Pick<ParsedTransaction, 'type' | 'amountMinor'>;

export type Rule = {
  name: string;
  pattern: RegExp;
  map: (m: RegExpExecArray) => RuleMatch;
};

export type SenderRules = {
  // DLT header, the 6 characters after the operator prefix, e.g. HDFCBK in VM-HDFCBK-S.
  headers: string[];
  rules: Rule[];
};
