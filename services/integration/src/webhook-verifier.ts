import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Plain === leaks how many leading bytes matched via response timing —
  // an attacker can use that to forge a valid signature byte-by-byte.
  // timingSafeEqual needs equal-length buffers, so length-mismatch is
  // checked first (also constant w.r.t. content, just not w.r.t. length).
  const expectedBuf = Buffer.from(expected, 'hex');
  const signatureBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
