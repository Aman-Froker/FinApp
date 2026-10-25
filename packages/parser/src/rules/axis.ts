import { AMOUNT, LAST4, tidy, toMinor } from '../normalise';
import type { SenderRules } from '../types';

export const axis: SenderRules = {
  headers: ['AXISBK', 'AXISMR'],
  rules: [
    {
      name: 'axis.upi.debit',
      pattern: new RegExp(String.raw`${AMOUNT} debited\s*A\/c no\. ${LAST4}\s*[\d-]+,\s*[\d:]+\s*UPI\/P2[MA]\/(\d+)\/(.+?)\s*Not you`, 'is'),
      map: (m) => ({
        type: 'debit',
        amountMinor: toMinor(m[1]!),
        accountLast4: m[2]!,
        instrument: 'upi',
        referenceNo: m[3]!,
        counterparty: tidy(m[4]),
      }),
    },
  ],
};
