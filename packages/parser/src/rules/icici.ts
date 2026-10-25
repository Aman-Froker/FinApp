import { AMOUNT, LAST4, tidy, toMinor } from '../normalise';
import type { SenderRules } from '../types';

export const icici: SenderRules = {
  headers: ['ICICIT', 'ICICIB', 'ICICBK'],
  rules: [
    {
      name: 'icici.card.spent',
      pattern: new RegExp(String.raw`${AMOUNT} spent using ICICI Bank Card ${LAST4} on [\w-]+ on (.+?)\.\s*Avl Limit`, 'is'),
      map: (m) => ({
        type: 'debit',
        amountMinor: toMinor(m[1]!),
        accountLast4: m[2]!,
        instrument: 'card',
        counterparty: tidy(m[3]),
      }),
    },
    {
      name: 'icici.upi.debit',
      pattern: new RegExp(String.raw`Acct ${LAST4} debited for ${AMOUNT} on [\w-]+;\s*(.+?) credited\.\s*UPI:(\d+)`, 'is'),
      map: (m) => ({
        type: 'debit',
        accountLast4: m[1]!,
        amountMinor: toMinor(m[2]!),
        instrument: 'upi',
        counterparty: tidy(m[3]),
        referenceNo: m[4]!,
      }),
    },
    {
      name: 'icici.credit',
      pattern: new RegExp(String.raw`Acct ${LAST4} is credited with ${AMOUNT} on [\w-]+ from (.+?)\.\s*UPI:(\d+)`, 'is'),
      map: (m) => ({
        type: 'credit',
        accountLast4: m[1]!,
        amountMinor: toMinor(m[2]!),
        instrument: 'upi',
        counterparty: tidy(m[3]),
        referenceNo: m[4]!,
      }),
    },
  ],
};
