import { tidy, toMinor } from './normalise';

// Payment notifications from UPI apps name the merchant that the bank SMS leaves as a bare UPI ID.
// The same package list is in the Android listener (UpiNotificationListener.kt); keep them in step.
export const UPI_APPS: Record<string, string> = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'com.dreamplug.androidapp': 'CRED',
};

export type UpiNote = { amountMinor: number; payee: string };

const RUPEES = String.raw`(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d{1,2})?)`;
const END = String.raw`(?=\s+(?:via|using|from|on|is|was|has been|successful(?:ly)?)\b|[.!\n]|$)`;
const VERB_FIRST = new RegExp(String.raw`\b(?:paid|sent|payment of)\s+` + RUPEES + String.raw`\s+(?:to|for)\s+(.+?)` + END, 'i');
const AMOUNT_FIRST = new RegExp(RUPEES + String.raw`\s+(?:paid|sent)\s+(?:successfully\s+)?to\s+(.+?)` + END, 'i');
// Money coming in, offers and requests name no merchant the user paid.
const NOT_A_PAYMENT = /\b(?:received|credited|cashback|reward|requested|request|refund|offer|failed|declined|pending)\b/i;

export function upiNote(app: string, title: string, text: string): UpiNote | null {
  if (!(app in UPI_APPS)) return null;
  const all = `${title}\n${text}`;
  if (NOT_A_PAYMENT.test(all)) return null;
  const m = VERB_FIRST.exec(all) ?? AMOUNT_FIRST.exec(all);
  const payee = tidy(m?.[2]);
  if (!m || !payee || payee.includes('@')) return null;
  return { amountMinor: toMinor(m[1]!), payee };
}
