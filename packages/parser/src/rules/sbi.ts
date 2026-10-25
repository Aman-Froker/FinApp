import { AMOUNT, LAST4, tidy, toMinor } from '../normalise';
import type { SenderRules } from '../types';

export const sbi: SenderRules = {
  headers: ['SBIUPI', 'SBIINB', 'SBIPSG', 'CBSSBI', 'ATMSBI'],
  rules: [
    {
      name: 'sbi.upi.debit',
      pattern: new RegExp(String.raw`A\/C ${LAST4} debited by ${AMOUNT} on date \w+ trf to (.+?) Refno (\d+)`, 'is'),
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
      name: 'sbi.credit',
      pattern: new RegExp(String.raw`A\/c ${LAST4}-credited by ${AMOUNT} on \w+ (?:transfer )?from (.+?) Ref No (\d+)`, 'is'),
      map: (m) => ({
        type: 'credit',
        accountLast4: m[1]!,
        amountMinor: toMinor(m[2]!),
        counterparty: tidy(m[3]),
        referenceNo: m[4]!,
      }),
    },
  ],
};
