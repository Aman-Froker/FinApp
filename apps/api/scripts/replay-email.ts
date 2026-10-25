// Development stand-in for the Cloudflare Worker: posts a saved email fixture to the webhook, signed
// like the Worker signs it. Usage:
//   pnpm --filter @finapp/api replay-email fixtures/emails/hdfc-card-statement.json <forwarding address>
import { readFileSync } from 'node:fs';

import { sign } from '../src/modules/inbound/inbound.service.js';

const [file, to, url = 'http://localhost:3000'] = process.argv.slice(2);
const secret = process.env.INBOUND_SECRET;
if (!file || !to || !secret) {
  console.error('Usage: replay-email <fixture.json> <address> [api url]  (INBOUND_SECRET must be set)');
  process.exit(1);
}
const raw = JSON.stringify({ receivedAt: new Date().toISOString(), ...JSON.parse(readFileSync(file, 'utf8')), to });
const res = await fetch(`${url}/v1/inbound/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-inbound-signature': sign(raw, secret) },
  body: raw,
});
console.log(`${res.status} ${res.statusText}`);
