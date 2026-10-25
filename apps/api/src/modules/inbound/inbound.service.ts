import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { maskForFallback, notice, parse } from '@finapp/parser';
import type { InboundEmail, InboundPayload } from '@finapp/shared';

// Bank alert emails are mostly HTML tables; the parser wants the text a person would read.
export function toText(email: InboundEmail): string {
  if (email.text.trim()) return email.text;
  return email.html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/tr|\/div|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const GMAIL_CONFIRMATION = /forwarding-noreply@google\.com/i;
const CONFIRMATION_CODE = /confirmation code:\s*(\d{6,12})/i;
const SUMMARY_CHARS = 300;

// What the phone needs from one email, or null when the email is not a bank alert. The same parser
// as SMS reads it; nothing else from the email is kept.
export function extract(email: InboundEmail): InboundPayload | null {
  const text = `${email.subject}\n${toText(email)}`;
  if (GMAIL_CONFIRMATION.test(email.from)) {
    const code = CONFIRMATION_CODE.exec(text)?.[1];
    return code ? { kind: 'gmail_confirmation', code } : null;
  }
  const input = { sender: email.from, body: text, receivedAt: email.receivedAt, channel: 'email' as const };
  const n = notice(input);
  if (n?.kind === 'statement') {
    return { kind: 'statement', accountLast4: n.accountLast4, totalDueMinor: n.totalDueMinor, minDueMinor: n.minDueMinor, dueDate: n.dueDate };
  }
  const p = parse(input);
  if (!p) return null;
  return {
    kind: 'transaction',
    type: p.type,
    amountMinor: p.amountMinor,
    accountLast4: p.accountLast4,
    instrument: p.instrument,
    counterparty: p.counterparty,
    counterpartyVpa: p.counterpartyVpa,
    balanceAfterMinor: p.balanceAfterMinor,
    status: p.status,
    referenceNo: p.referenceNo,
    summary: maskForFallback(text.replace(/\s+/g, ' ')).slice(0, SUMMARY_CHARS),
  };
}

// The Worker signs the exact bytes it sends: hex HMAC-SHA256 with the shared secret.
export function signatureValid(raw: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const sign = (raw: string | Buffer, secret: string) => createHmac('sha256', secret).update(raw).digest('hex');

// 16 characters of base32: unguessable, and fine as an email local part.
export function newInboxToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return [...randomBytes(16)].map((b) => alphabet[b % 32]).join('');
}

export const tokenOf = (to: string) => /^([a-z2-7]{16})@/i.exec(to.trim().replace(/^.*</, ''))?.[1]?.toLowerCase() ?? null;
