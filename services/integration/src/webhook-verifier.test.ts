import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from './webhook-verifier';
import crypto from 'crypto';

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature', () => {
    const payload = JSON.stringify({ some: 'data' });
    const secret = 'supersecret';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const result = verifyWebhookSignature(payload, signature, secret);
    expect(result).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = JSON.stringify({ some: 'data' });
    const secret = 'supersecret';
    
    const result = verifyWebhookSignature(payload, 'wrongsignature', secret);
    expect(result).toBe(false);
  });
});
