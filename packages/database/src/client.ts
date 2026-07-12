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
    max: 1,
    prepare: false, // required for Supabase transaction-mode pooling
    connect_timeout: 10,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
