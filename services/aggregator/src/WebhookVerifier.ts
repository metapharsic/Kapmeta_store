import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies HMAC-SHA256 webhook signatures for Swiggy/Zomato order webhooks.
 * Both platforms sign the raw (unparsed) request body with a shared secret
 * and send the hex-encoded digest in a header; verification here recomputes
 * the digest and compares in constant time.
 */

function verifyHmacSha256Hex(rawBody: string, signatureHex: string, secret: string): boolean {
  if (!signatureHex) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signatureHex, 'hex');

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function verifySwiggySignature(rawBody: string, signature: string, secret: string): boolean {
  return verifyHmacSha256Hex(rawBody, signature, secret);
}

export function verifyZomatoSignature(rawBody: string, signature: string, secret: string): boolean {
  return verifyHmacSha256Hex(rawBody, signature, secret);
}
