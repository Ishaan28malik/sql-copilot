import type { ConnectionCredentials } from '@sqlcopilot/shared';
import postgres from 'postgres';

export type TenantSql = postgres.Sql;

/**
 * Raw postgres.js client for a *tenant's* database (the one users connect).
 * Always short-lived: create, use, and close within a single operation.
 */
export function createTenantSql(creds: ConnectionCredentials, options?: { connectTimeoutSec?: number }): TenantSql {
  return postgres({
    host: creds.host,
    port: creds.port,
    database: creds.database,
    username: creds.user,
    password: creds.password,
    ssl: creds.ssl ? 'require' : undefined,
    max: 1,
    prepare: false,
    connect_timeout: options?.connectTimeoutSec ?? 10,
  });
}

/** Cheap connectivity probe used before persisting credentials. */
export async function testTenantConnection(creds: ConnectionCredentials): Promise<void> {
  const sql = createTenantSql(creds);
  try {
    await sql`SELECT 1`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
