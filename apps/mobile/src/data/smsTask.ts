import { getSetting } from './db';
import { refreshAll } from './refresh';

const TRIES = 3;
const WAIT_MS = 2_000;

// Headless task run by the native SMS receiver, with the app open or closed. The inbox row can land
// a moment after the broadcast, so the read is retried until the new message is seen.
export async function smsReceived(): Promise<void> {
  for (let i = 0; i < TRIES; i++) {
    const before = await getSetting('sms.since');
    if (!(await refreshAll())) return;
    if ((await getSetting('sms.since')) !== before) return;
    await new Promise((r) => setTimeout(r, WAIT_MS));
  }
}
