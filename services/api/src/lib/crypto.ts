import { AppError } from '@sqlcopilot/shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
// Cloudflare Workers' WebCrypto caps PBKDF2 at 100k iterations. The stored
// hash records its own iteration count, so verification stays correct if this
// value ever changes.
const PBKDF2_ITERATIONS = 100_000;

const toB64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromB64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256; WebCrypto works in Workers and Node)
// ---------------------------------------------------------------------------

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `v1.${PBKDF2_ITERATIONS}.${toB64(salt)}.${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [version, iterations, saltB64, hashB64] = stored.split('.');
  if (version !== 'v1' || !iterations || !saltB64 || !hashB64) return false;
  const candidate = await deriveBits(password, fromB64(saltB64), Number(iterations));
  return timingSafeEqual(candidate, fromB64(hashB64));
}

// ---------------------------------------------------------------------------
// Credential encryption (AES-256-GCM, random IV per message, iv || ciphertext)
// ---------------------------------------------------------------------------

async function importAesKey(keyB64: string, usage: 'encrypt' | 'decrypt') {
  const raw = fromB64(keyB64);
  if (raw.length !== 32) {
    throw new AppError('CONFIG_ERROR', 'ENCRYPTION_KEY must be a base64-encoded 32-byte key', 500);
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

export async function encryptJson(value: unknown, keyB64: string): Promise<string> {
  const key = await importAesKey(keyB64, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const out = new Uint8Array(iv.length + ciphertext.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ciphertext), iv.length);
  return toB64(out);
}

export async function decryptJson<T>(payload: string, keyB64: string): Promise<T> {
  const key = await importAesKey(keyB64, 'decrypt');
  const data = fromB64(payload);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12) },
    key,
    data.slice(12),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
