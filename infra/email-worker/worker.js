// Cloudflare Email Worker: every email to *@<INBOUND_DOMAIN> arrives here (Email Routing catch-all),
// is reduced to its text parts and posted to the API, signed with the shared secret. Nothing is
// stored by the Worker.
import PostalMime from 'postal-mime';

const MAX_TEXT = 200_000;
const MAX_HTML = 500_000;

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);
    const body = JSON.stringify({
      to: message.to,
      from: parsed.from?.address ? `${parsed.from.name ?? ''} <${parsed.from.address}>`.trim() : message.from,
      subject: parsed.subject ?? '',
      text: (parsed.text ?? '').slice(0, MAX_TEXT),
      html: (parsed.html ?? '').slice(0, MAX_HTML),
      messageId: parsed.messageId ?? `${message.from}-${Date.now()}`,
      receivedAt: new Date().toISOString(),
    });
    const res = await fetch(`${env.API_URL}/v1/inbound/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-inbound-signature': await hmacHex(env.INBOUND_SECRET, body) },
      body,
    });
    // A server error makes Cloudflare retry the delivery later; anything else is final.
    if (res.status >= 500) throw new Error(`API answered ${res.status}`);
  },
};
