import { z } from 'zod';

// ISO 4217 alphabetic code.
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');

// Integer minor units (paise, pence, cents). Never a float.
export const moneySchema = z.object({
  amountMinor: z.number().int().safe(),
  currency: currencyCodeSchema,
});

export type Money = z.infer<typeof moneySchema>;
