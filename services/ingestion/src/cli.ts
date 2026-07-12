/**
 * Standalone reindexer for large schemas that exceed Worker CPU limits.
 * Usage:
 *   DATABASE_URL=... ENCRYPTION_KEY=... OLLAMA_URL=... \
 *   node --experimental-strip-types src/cli.ts <connectionId>
 */
import { OllamaProvider } from '@sqlcopilot/ai';
import { connections, createAppDb } from '@sqlcopilot/database';
import { connectionCredentialsSchema, createLogger } from '@sqlcopilot/shared';
import { eq } from 'drizzle-orm';
import { ingestSchema } from './ingest';

const connectionId = process.argv[2];
const { DATABASE_URL, ENCRYPTION_KEY, OLLAMA_URL, OLLAMA_EMBED_MODEL } = process.env;

if (!connectionId || !DATABASE_URL || !ENCRYPTION_KEY || !OLLAMA_URL) {
  console.error('Usage: DATABASE_URL=... ENCRYPTION_KEY=... OLLAMA_URL=... reindex <connectionId>');
  process.exit(1);
}

// Mirrors services/api/src/lib/crypto.ts (WebCrypto is global in Node >= 20).
async function decryptJson<T>(payload: string, keyB64: string): Promise<T> {
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const data = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

const logger = createLogger('info', { service: 'ingestion-cli' });
const { db, close } = createAppDb(DATABASE_URL);

try {
  const [connection] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!connection) throw new Error(`connection ${connectionId} not found`);

  const creds = connectionCredentialsSchema.parse(
    await decryptJson(connection.encryptedCredentials, ENCRYPTION_KEY),
  );
  const embedder = new OllamaProvider({
    baseUrl: OLLAMA_URL,
    model: process.env.OLLAMA_MODEL ?? 'qwen2.5:7b',
    embedModel: OLLAMA_EMBED_MODEL ?? 'bge-small-en-v1.5',
    logger,
  });

  const result = await ingestSchema({ db, embedder, logger }, connectionId, creds);
  logger.info('reindex complete', { ...result });
} finally {
  await close();
}
