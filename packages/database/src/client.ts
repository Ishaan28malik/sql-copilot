import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

/**
 * Creates a Drizzle client for the application's own Supabase Postgres.
 *
 * In Cloudflare Workers, create one per request and avoid sharing across
 * requests; `max: 1` plus Supabase's connection pooler (port 6543) keeps
 * connection counts safe.
 */
export function createAppDb(databaseUrl: string): { db: AppDatabase; close: () => Promise<void> } {
  const client = postgres(databaseUrl, {
    // Cloudflare's recommended Hyperdrive + postgres.js settings. Hyperdrive
    // pools origin connections, so the driver keeps a small local pool and
    // skips the pg_type catalog round-trip (which stalls behind pooling).
    max: 5,
    prepare: false,
    fetch_types: false,
    connect_timeout: 15,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
