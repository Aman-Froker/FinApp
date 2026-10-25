import { z } from 'zod';

export const CATEGORIES = [
  'Groceries',
  'Food delivery',
  'Eating out',
  'Shopping',
  'Transport',
  'Bills',
  'Rent',
  'Entertainment',
  'Health',
  'Travel',
  'Family and friends',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

// UPI IDs never leave the phone in clear: they are sent as SHA-256 hex.
const vpaHash = z.string().regex(/^[a-f0-9]{64}$/);

export const merchantLookupBodySchema = z.object({ hashes: z.array(vpaHash).min(1).max(50) });
export const merchantSchema = z.object({ hash: vpaHash, name: z.string(), category: z.enum(CATEGORIES) });
export const merchantLookupResponseSchema = z.object({ merchants: z.array(merchantSchema) });

export const merchantLabelsBodySchema = z.object({
  labels: z
    .array(
      z.object({
        hash: vpaHash,
        name: z.string().trim().min(1).max(60),
        // Payments to people are never shared, so this category cannot be sent.
        category: z.enum(CATEGORIES).exclude(['Family and friends']),
      }),
    )
    .min(1)
    .max(20),
});

export type MerchantLookupBody = z.infer<typeof merchantLookupBodySchema>;
export type Merchant = z.infer<typeof merchantSchema>;
export type MerchantLookupResponse = z.infer<typeof merchantLookupResponseSchema>;
export type MerchantLabelsBody = z.infer<typeof merchantLabelsBodySchema>;
