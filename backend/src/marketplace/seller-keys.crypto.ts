import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Seller-key vault cryptography (Design A custody keys).
 *
 * The marketplace settlement keypairs are encrypted at rest with AES-256-GCM
 * under a server-only master key read from the environment. The plaintext is
 * NEVER logged, returned over the wire, or written to the database unencrypted.
 *
 * Payload format (single base64 string):
 *   base64( iv[12] ++ authTag[16] ++ ciphertext )
 */

/** AES-GCM iv length (12 bytes) and auth-tag length (16 bytes). */
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Derive the 32-byte AES-256 master key from its raw environment value.
 * The env value is the base64 encoding of 32 random bytes.
 */
export function parseMasterKey(raw: string | undefined, fallback?: Buffer): Buffer {
  if (raw && raw.length > 0) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
    throw new Error(
      'MARKETPLACE_SELLER_KEY_ENCRYPTION_KEY must be the base64 encoding of exactly 32 bytes.',
    );
  }
  if (fallback) return fallback;
  throw new Error(
    'MARKETPLACE_SELLER_KEY_ENCRYPTION_KEY is not configured. Generate one with ' +
      '`node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))"`.',
  );
}

/** Encrypt `plaintext` (bytes) under `key`; returns the combined base64 payload. */
export function encryptSecret(plaintext: Uint8Array, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a payload produced by {@link encryptSecret}. Throws on any
 * tampering / wrong key (GCM authentication failure).
 */
export function decryptSecret(payload: string, key: Buffer): Buffer {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < IV_LEN + TAG_LEN) {
    throw new Error('Malformed encrypted secret payload.');
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}