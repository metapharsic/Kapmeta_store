import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// At-rest encryption for aggregator API keys/secrets (ChannelAccount
// apiKeyEncrypted/apiSecretEncrypted). AES-256-GCM, one random IV per value.
// CREDENTIALS_ENCRYPTION_KEY is a passphrase, not a raw key — scrypt derives
// a fixed-length key from it so any-length env value works.
const ENCRYPTION_KEY_ENV =
  process.env.CREDENTIALS_ENCRYPTION_KEY ||
  "dev_only_channel_credentials_key_change_in_prod";
const ENCRYPTION_KEY: string = ENCRYPTION_KEY_ENV;

function deriveKey(): Buffer {
  return scryptSync(ENCRYPTION_KEY, "kapmeta-channel-credentials", 32);
}

// Format: iv(hex):authTag(hex):ciphertext(hex)
export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptCredential(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

// For the "connected" UI badge — show only the last 4 chars, never round-trip.
export function maskCredential(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}
