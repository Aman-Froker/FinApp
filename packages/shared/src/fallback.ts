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

// A message shape learned on a phone from one model answer (see learnRule in @finapp/parser). The
// server checks the pattern with safePattern before storing it.
export const learnedRuleSchema = z.object({
  header: z.string().regex(/^[A-Z0-9]{6}$/),
  pattern: z.string().min(3).max(3000),
  groups: z.array(z.enum(['amount', 'party'])).min(1).max(2),
  type: z.enum(['debit', 'credit']),
  instrument: fallbackTransactionSchema.shape.instrument,
  status: fallbackTransactionSchema.shape.status,
});

export const learnedRulesBodySchema = z.object({ rules: z.array(learnedRuleSchema).min(1).max(100) });
export const learnedRulesResponseSchema = z.object({ rules: z.array(learnedRuleSchema) });

export type LearnedRuleDto = z.infer<typeof learnedRuleSchema>;
export type LearnedRulesBody = z.infer<typeof learnedRulesBodySchema>;
export type LearnedRulesResponse = z.infer<typeof learnedRulesResponseSchema>;
