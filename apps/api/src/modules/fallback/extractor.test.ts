import type { GoogleGenAI } from '@google/genai';
import { describe, expect, test } from 'vitest';

import { vertexExtractor } from './extractor.js';

// A stand-in for the Gemini client: answers with whatever JSON text the test gives it.
const fake = (text: string | undefined) => ({ models: { generateContent: async () => ({ text }) } }) as unknown as GoogleGenAI;
const config = { project: 'p', location: 'global', model: 'gemini-2.5-flash', clientEmail: 'a@b.iam.gserviceaccount.com', privateKey: 'k' };
const sms = { sender: 'VM-SIMPLE-S', text: 'INR 2,340.50 has left your Simpl a/c XXXX towards ZOMATO MEDIA PVT LTD.' };
const answer = (over: object) =>
  JSON.stringify({ isTransaction: true, type: 'debit', amountAsWritten: '2,340.50', counterparty: 'ZOMATO MEDIA PVT LTD', instrument: null, status: null, ...over });

describe('Gemini on Vertex extractor', () => {
  test('a well-formed answer becomes a transaction in paise', async () => {
    expect(await vertexExtractor(config, fake(answer({}))).extract(sms)).toEqual({
      type: 'debit',
      amountMinor: 234050,
      counterparty: 'ZOMATO MEDIA PVT LTD',
      instrument: 'other',
      status: 'success',
    });
  });

  test('an amount that is not written in the message is refused', async () => {
    expect(await vertexExtractor(config, fake(answer({ amountAsWritten: '2,345.50' }))).extract(sms)).toBeNull();
  });

  test('not a transaction, broken JSON or the wrong shape all give nothing', async () => {
    expect(await vertexExtractor(config, fake(answer({ isTransaction: false }))).extract(sms)).toBeNull();
    expect(await vertexExtractor(config, fake('{"isTransaction": tru')).extract(sms)).toBeNull();
    expect(await vertexExtractor(config, fake('{"amount": 5}')).extract(sms)).toBeNull();
    expect(await vertexExtractor(config, fake(undefined)).extract(sms)).toBeNull();
  });
});
