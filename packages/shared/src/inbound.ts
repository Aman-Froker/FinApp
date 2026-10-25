import { z } from 'zod';

// What the Cloudflare Email Worker posts for each email it receives, signed with the shared secret.
export const inboundEmailSchema = z.object({
  to: z.string().min(3).max(320),
  from: z.string().max(320),
  subject: z.string().max(1000).default(''),
  text: z.string().max(200_000).default(''),
  html: z.string().max(500_000).default(''),
  messageId: z.string().min(1).max(1000),
  receivedAt: z.string().datetime(),
});

const transactionItem = z.object({
  kind: z.literal('transaction'),
  type: z.enum(['debit', 'credit']),
  amountMinor: z.number().int().positive(),
  accountLast4: z.string().nullable(),
  instrument: z.string(),
  counterparty: z.string().nullable(),
  counterpartyVpa: z.string().nullable(),
  balanceAfterMinor: z.number().int().nullable(),
  status: z.enum(['success', 'failed', 'refund']),
  referenceNo: z.string().nullable(),
  // Kept for the phone to tell spending from card bills and fees, as it does for SMS.
  summary: z.string(),
});
const statementItem = z.object({
  kind: z.literal('statement'),
  accountLast4: z.string().nullable(),
  totalDueMinor: z.number().int().positive(),
  minDueMinor: z.number().int().nullable(),
  dueDate: z.string(),
});
const confirmationItem = z.object({ kind: z.literal('gmail_confirmation'), code: z.string() });

export const inboundPayloadSchema = z.discriminatedUnion('kind', [transactionItem, statementItem, confirmationItem]);
export const inboundItemSchema = z.object({ id: z.string(), receivedAt: z.string(), payload: inboundPayloadSchema });
export const inboundItemsResponseSchema = z.object({ items: z.array(inboundItemSchema) });
export const inboundAckBodySchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });
export const inboundAddressResponseSchema = z.object({ address: z.string() });

export type InboundEmail = z.infer<typeof inboundEmailSchema>;
export type InboundPayload = z.infer<typeof inboundPayloadSchema>;
export type InboundItem = z.infer<typeof inboundItemSchema>;
export type InboundItemsResponse = z.infer<typeof inboundItemsResponseSchema>;
export type InboundAckBody = z.infer<typeof inboundAckBodySchema>;
