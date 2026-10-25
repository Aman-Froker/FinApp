import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().startsWith('mongodb'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  // Without a key the parse fallback answers 503 and the phone keeps the message unparsed.
  ANTHROPIC_API_KEY: z.string().optional(),
  FALLBACK_MONTHLY_CAP: z.coerce.number().int().positive().default(300),
  // Or Gemini on Vertex AI with a service account, used when there is no Anthropic key.
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_LOCATION: z.string().default('global'),
  VERTEX_MODEL: z.string().default('gemini-2.5-flash'),
  VERTEX_CLIENT_EMAIL: z.string().email().optional(),
  VERTEX_PRIVATE_KEY: z
    .string()
    .optional()
    // Env files keep the key on one line with literal \n.
    .transform((k) => k?.replace(/^"|"$/g, '').replace(/\\n/g, '\n')),
  // Email forwarding. Without both, the address and the webhook answer 503.
  INBOUND_DOMAIN: z.string().regex(/^[a-z0-9.-]+\.[a-z]+$/).optional(),
  INBOUND_SECRET: z.string().min(32, 'INBOUND_SECRET must be at least 32 characters').optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // The server refuses to start with a bad environment.
  console.error('Invalid environment:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
