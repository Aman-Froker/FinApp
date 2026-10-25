import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { amountsIn, toMinor } from '@finapp/parser';
import type { FallbackTransaction } from '@finapp/shared';
import { z } from 'zod';

// Provider interface, so the model vendor can change without touching the route.
export type Extractor = {
  extract(input: { sender: string; text: string }): Promise<FallbackTransaction | null>;
};

const ModelOutput = z.object({
  isTransaction: z.boolean(),
  type: z.enum(['debit', 'credit']).nullable(),
  amountAsWritten: z.string().nullable(),
  counterparty: z.string().nullable(),
  instrument: z.enum(['upi', 'card', 'nach', 'atm', 'imps', 'neft', 'other']).nullable(),
  status: z.enum(['success', 'failed', 'refund']).nullable(),
});

const SYSTEM = `You read one SMS from an Indian bank, card issuer or payment app and say whether it reports money that has already moved.
Account numbers, balances and reference numbers are masked.
isTransaction is false for OTPs, promotions, offers, reminders of future debits, statements and due notices.
amountAsWritten: copy the transaction amount exactly as it appears in the message, for example "1,250.00". Never calculate, round or guess; use null if no amount is written.
counterparty: the merchant, person or company as written, or null. Never a bank account or a masked value.`;

export function anthropicExtractor(client = new Anthropic()): Extractor {
  return {
    async extract({ sender, text }) {
      const response = await client.messages.parse({
        model: 'claude-haiku-5-5',
        max_tokens: 2048,
        system: SYSTEM,
        output_config: { effort: 'low', format: zodOutputFormat(ModelOutput) },
        messages: [{ role: 'user', content: `Sender: ${sender}\n\n${text}` }],
      });
      if (response.stop_reason === 'refusal') return null;
      const out = response.parsed_output;
      if (!out?.isTransaction || !out.type || !out.amountAsWritten) return null;
      const amountMinor = toMinor(out.amountAsWritten);
      // The AI never invents numbers: the amount must appear verbatim in the message.
      if (amountMinor <= 0 || !amountsIn(text).has(amountMinor)) return null;
      return {
        type: out.type,
        amountMinor,
        counterparty: out.counterparty,
        instrument: out.instrument ?? 'other',
        status: out.status ?? 'success',
      };
    },
  };
}
