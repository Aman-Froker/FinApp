import { z } from 'zod';

// An SMS the rules could not read, masked on the phone before it is sent.
export const fallbackRequestSchema = z.object({
  sender: z.string().min(1).max(20),
  text: z.string().min(1).max(1000),
  templateKey: z.string().min(1).max(1200),
});

export const fallbackTransactionSchema = z.object({
  type: z.enum(['debit', 'credit']),
  amountMinor: z.number().int().positive(),
  counterparty: z.string().nullable(),
  instrument: z.enum(['upi', 'card', 'nach', 'atm', 'imps', 'neft', 'other']),
  status: z.enum(['success', 'failed', 'refund']),
});

export const fallbackResponseSchema = z.object({ transaction: fallbackTransactionSchema.nullable() });

export type FallbackRequest = z.infer<typeof fallbackRequestSchema>;
export type FallbackTransaction = z.infer<typeof fallbackTransactionSchema>;
export type FallbackResponse = z.infer<typeof fallbackResponseSchema>;
