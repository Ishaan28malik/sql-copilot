import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, hashPassword, randomToken, verifyPassword } from '../lib/crypto';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('hunter22secret');
    expect(await verifyPassword('hunter22secret', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('hunter22secret');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

describe('credential encryption', () => {
  it('round-trips JSON', async () => {
    const creds = { host: 'db.example.com', password: 'p@ss' };
    const ciphertext = await encryptJson(creds, KEY);
    expect(ciphertext).not.toContain('example.com');
    expect(await decryptJson(ciphertext, KEY)).toEqual(creds);
  });

  it('produces distinct ciphertexts per call (random IV)', async () => {
    const a = await encryptJson({ v: 1 }, KEY);
    const b = await encryptJson({ v: 1 }, KEY);
    expect(a).not.toBe(b);
  });
});

describe('randomToken', () => {
  it('is url-safe and unique', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomToken()).not.toBe(token);
  });
});
