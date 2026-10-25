import { AMOUNT, LAST4, tidy, toMinor, withoutGateway } from '../normalise';
import type { SenderRules } from '../types';

export const axis: SenderRules = {
  headers: ['AXISBK', 'AXISMR'],
  rules: [
    // Card spends in rupees only: a USD spend stays unread rather than be counted as rupees.
    {
      name: 'axis.card.spent',
      pattern: new RegExp(String.raw`^Spent INR ([\d,]+(?:\.\d{1,2})?)\s+Axis Bank (?:Credit )?Card no\.\s*${LAST4}\s+[\d-]+\s+[\d:]+\s+IST\s+(.+?)\s+Avl Limit`, 'is'),
      map: (m) => ({
        type: 'debit',
        amountMinor: toMinor(m[1]!),
        accountLast4: m[2]!,
        instrument: 'card',
        counterparty: tidy(withoutGateway(m[3]!)),
      }),
    },
    // Debit card spends: "INR 423.00 debited from A/c no. XX123456 on Bundl techn 31-10-2025 23:15:49 IST."
    {
      name: 'axis.debitcard',
      pattern: new RegExp(String.raw`^INR ([\d,]+(?:\.\d{1,2})?) debited from A\/c no\. [Xx]+\d*?(\d{4}) on (.+?)\s+\d{2}-\d{2}-\d{4} [\d:]+ IST\.`, 'i'),
      map: (m) => ({ type: 'debit', amountMinor: toMinor(m[1]!), accountLast4: m[2]!, instrument: 'card', counterparty: tidy(withoutGateway(m[3]!)) }),
    },
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
