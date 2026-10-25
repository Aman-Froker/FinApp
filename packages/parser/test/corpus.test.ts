import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, test } from 'vitest';

import { headerOf } from '../src/normalise';
import { maskForFallback, parse, templateKey } from '../src/index';

type Line = { sender: string; body: string; expected: Record<string, unknown> | null };

const dir = fileURLToPath(new URL('../corpus/', import.meta.url));
const lines: (Line & { file: string; n: number })[] = readdirSync(dir)
  .filter((f) => f.endsWith('.jsonl'))
  .flatMap((file) =>
    readFileSync(dir + file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l, i) => ({ ...(JSON.parse(l) as Line), file, n: i + 1 })),
  );

const stats = new Map<string, { pass: number; total: number }>();

describe('corpus', () => {
  test.each(lines)('$file:$n $sender', ({ sender, body, expected }) => {
    const got = parse({ sender, body, receivedAt: '2026-10-24T14:44:00.000Z', channel: 'sms' });
    const key = headerOf(sender) ?? 'personal';
    const s = stats.get(key) ?? { pass: 0, total: 0 };
    s.total++;
    stats.set(key, s);
    if (expected === null) expect(got).toBeNull();
    else expect(got).toMatchObject(expected);
    s.pass++;
  });

  afterAll(() => {
    const rows = [...stats].map(([h, s]) => `${h.padEnd(8)} ${s.pass}/${s.total} ${Math.round((100 * s.pass) / s.total)}%`);
    console.log(`\nParse rate by sender\n${rows.join('\n')}`);
  });
});

test('parses 5,000 messages well inside the 30 second history budget', () => {
  const started = performance.now();
  for (let i = 0; i < 5000; i++) {
    const l = lines[i % lines.length]!;
    parse({ sender: l.sender, body: l.body.replace(/\d{3}\.00/, `${100 + (i % 900)}.00`), receivedAt: '2026-10-24T14:44:00.000Z', channel: 'sms' });
  }
  // shortcut: measured on the dev Mac, not a low-end phone; budget 3 s here leaves 10x headroom for slow devices
  expect(performance.now() - started).toBeLessThan(3000);
});

test('amounts become paise exactly', async () => {
  const { toMinor } = await import('../src/normalise');
  expect(toMinor('Rs.1,23,456.78')).toBe(12345678);
  expect(toMinor('450.0')).toBe(45000);
  expect(toMinor('2000')).toBe(200000);
  expect(toMinor('0.07')).toBe(7);
});

test('fallback masking hides accounts, balances and long numbers but keeps the amount', () => {
  const body = 'Rs.320.00 debited from A/c XX1234 Ref 429812345683. Avl Bal Rs.12,340.25';
  const masked = maskForFallback(body);
  expect(masked).toContain('Rs.320.00');
  expect(masked).not.toMatch(/1234\b|429812345683|12,340/);
  expect(templateKey(body)).toBe(templateKey(body.replace('320.00', '999.00')));
});
