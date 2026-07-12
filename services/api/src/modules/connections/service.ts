import { connections, type AppDatabase } from '@sqlcopilot/database';
import {
  connectionCredentialsSchema,
  notFound,
  sqlDialectSchema,
  type ConnectionCredentials,
  type ConnectionSummary,
} from '@sqlcopilot/shared';
import { and, eq } from 'drizzle-orm';
import { decryptJson } from '../../lib/crypto';

export type ConnectionRow = typeof connections.$inferSelect;

/** Loads a connection and enforces tenant ownership in one place. */
export async function getOwnedConnection(
  db: AppDatabase,
  userId: string,
  connectionId: string,
): Promise<ConnectionRow> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.userId, userId)));
  if (!row) throw notFound('Connection not found');
  return row;
}

export async function getConnectionCredentials(
  row: ConnectionRow,
  encryptionKey: string,
): Promise<ConnectionCredentials> {
  const decrypted = await decryptJson<unknown>(row.encryptedCredentials, encryptionKey);
  return connectionCredentialsSchema.parse(decrypted);
}

export function toConnectionSummary(row: ConnectionRow): ConnectionSummary {
  return {
    id: row.id,
    name: row.name,
    dialect: sqlDialectSchema.catch('postgres').parse(row.dialect),
    host: row.host,
    database: row.database,
    lastIngestedAt: row.lastIngestedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
