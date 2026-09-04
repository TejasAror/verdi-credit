import { randomBytes } from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  parseMasterKey,
} from './seller-keys.crypto';

describe('seller-keys.crypto', () => {
  const key = randomBytes(32);

  it('round-trips a secret through AES-256-GCM', () => {
    const plaintext = new TextEncoder().encode('[1,2,3]');
    const payload = encryptSecret(plaintext, key);
    expect(payload).not.toContain('[1,2,3]'); // never stores plaintext
    const back = decryptSecret(payload, key);
    expect(Buffer.from(back).toString('utf8')).toBe('[1,2,3]');
  });

  it('produces a unique ciphertext per call (random iv)', () => {
    const plaintext = new TextEncoder().encode('same-secret');
    expect(encryptSecret(plaintext, key)).not.toBe(encryptSecret(plaintext, key));
  });

  it('throws on tampered payloads (GCM authentication)', () => {
    const payload = encryptSecret(new TextEncoder().encode('secret'), key);
    const buf = Buffer.from(payload, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip one ciphertext bit
    expect(() => decryptSecret(buf.toString('base64'), key)).toThrow();
  });

  it('throws when the master key is wrong', () => {
    const payload = encryptSecret(new TextEncoder().encode('secret'), key);
    expect(() => decryptSecret(payload, randomBytes(32))).toThrow();
  });

  it('parses a valid base64 32-byte master key', () => {
    const raw = Buffer.from(key).toString('base64');
    expect(parseMasterKey(raw).length).toBe(32);
  });

  it('throws when the master key env value is malformed', () => {
    expect(() => parseMasterKey('bjc')).toThrow(/32 bytes/i);
    expect(() => parseMasterKey(undefined)).toThrow(/not configured/i);
  });

  it('falls back to the provided dev/test key when env is unset', () => {
    expect(parseMasterKey(undefined, key)).toEqual(key);
  });
});