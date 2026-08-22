import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySwiggySignature, verifyZomatoSignature } from '../src/WebhookVerifier';

describe('WebhookVerifier', () => {
  const secret = 'test-secret';
  const rawBody = JSON.stringify({ order_id: 'ord_123', total: 250 });

  function sign(body: string, s: string): string {
    return createHmac('sha256', s).update(body, 'utf8').digest('hex');
  }

  it('verifySwiggySignature accepts a correctly signed body', () => {
    const sig = sign(rawBody, secret);
    expect(verifySwiggySignature(rawBody, sig, secret)).toBe(true);
  });

  it('verifySwiggySignature rejects a tampered body', () => {
    const sig = sign(rawBody, secret);
    const tampered = JSON.stringify({ order_id: 'ord_123', total: 999999 });
    expect(verifySwiggySignature(tampered, sig, secret)).toBe(false);
  });

  it('verifySwiggySignature rejects a wrong secret', () => {
    const sig = sign(rawBody, 'wrong-secret');
    expect(verifySwiggySignature(rawBody, sig, secret)).toBe(false);
  });

  it('verifyZomatoSignature accepts a correctly signed body', () => {
    const sig = sign(rawBody, secret);
    expect(verifyZomatoSignature(rawBody, sig, secret)).toBe(true);
  });

  it('verifyZomatoSignature rejects an empty signature', () => {
    expect(verifyZomatoSignature(rawBody, '', secret)).toBe(false);
  });

  it('verifyZomatoSignature rejects a malformed hex signature safely', () => {
    expect(verifyZomatoSignature(rawBody, 'not-hex-!!', secret)).toBe(false);
  });
});
