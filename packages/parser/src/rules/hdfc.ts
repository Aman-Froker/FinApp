import { AMOUNT, LAST4, tidy, toMinor } from '../normalise';
import type { SenderRules } from '../types';

export const hdfc: SenderRules = {
  headers: ['HDFCBK', 'HDFCBN'],
  rules: [
    {
      name: 'hdfc.upi.sent',
      pattern: new RegExp(String.raw`Sent ${AMOUNT}\s*From HDFC Bank A\/C ${LAST4}\s*To (.+?)\s*On [\d/]+\s*Ref (\d+)`, 'is'),
      map: (m) => ({
        type: 'debit',
        amountMinor: toMinor(m[1]!),
        accountLast4: m[2]!,
        instrument: 'upi',
        counterparty: tidy(m[3]),
        referenceNo: m[4]!,
      }),
    },
    {
      name: 'hdfc.card.spent',
      pattern: new RegExp(String.raw`Spent ${AMOUNT} On HDFC Bank Card ${LAST4} At (.+?) On [\d:-]+(?:.*?Bal ${AMOUNT})?`, 'is'),
      map: (m) => ({
        type: 'debit',
        amountMinor: toMinor(m[1]!),
        accountLast4: m[2]!,
        instrument: 'card',
        counterparty: tidy(m[3]),
        balanceAfterMinor: m[4] ? toMinor(m[4]) : null,
      }),
    },
    {
      name: 'hdfc.credit',
      pattern: new RegExp(String.raw`${AMOUNT} credited to HDFC Bank A\/c ${LAST4} on [\d-]+ from (?:VPA )?(\S+?)\s*\((?:UPI|IMPS|NEFT)?\s*(\d+)\)`, 'is'),
      map: (m) => ({
        type: 'credit',
        amountMinor: toMinor(m[1]!),
        accountLast4: m[2]!,
        counterpartyVpa: m[3]!.includes('@') ? m[3]! : null,
        counterparty: m[3]!.includes('@') ? null : tidy(m[3]),
        referenceNo: m[4]!,
      }),
    },
  ],
};
