import { schemaTables } from '@sqlcopilot/database';
import { ingestSchema } from '@sqlcopilot/ingestion';
import {
  badRequest,
  ingestSchemaRequestSchema,
  type SchemaTableSummary,
  type TableMetadata,
} from '@sqlcopilot/shared';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../env';
import { parseBody } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { getConnectionCredentials, getOwnedConnection } from '../connections/service';

export const ingestionRoutes = new Hono<AppEnv>();
ingestionRoutes.use('*', requireAuth);

async function handleIngest(c: Context<AppEnv>) {
  const body = await parseBody(c, ingestSchemaRequestSchema);
  const { deps, user } = c.var;

  const connection = await getOwnedConnection(deps.db, user.id, body.connectionId);
  const creds = await getConnectionCredentials(connection, deps.env.ENCRYPTION_KEY);

  const result = await ingestSchema(
    { db: deps.db, embedder: deps.embedder, logger: deps.logger },
    connection.id,
    creds,
  );
  deps.logger.info('schema ingested', { ...result });
  return c.json(result);
}

// /reindex is an alias by design: ingestion fully replaces the previous
// index, so re-running it after a schema change is the reindex operation.
ingestionRoutes.post('/ingest-schema', handleIngest);
ingestionRoutes.post('/reindex', handleIngest);

ingestionRoutes.get('/schema', async (c) => {
  const connectionId = c.req.query('connectionId');
  if (!connectionId) throw badRequest('connectionId query parameter is required');
  const { deps, user } = c.var;

  await getOwnedConnection(deps.db, user.id, connectionId);
  const rows = await deps.db
    .select({
      id: schemaTables.id,
      schemaName: schemaTables.schemaName,
      tableName: schemaTables.tableName,
      document: schemaTables.document,
      metadata: schemaTables.metadata,
      updatedAt: schemaTables.updatedAt,
    })
    .from(schemaTables)
    .where(eq(schemaTables.connectionId, connectionId));

  const tables: SchemaTableSummary[] = rows.map((row) => ({
    id: row.id,
    schema: row.schemaName,
    table: row.tableName,
    columnCount: (row.metadata as TableMetadata).columns?.length ?? 0,
    document: row.document,
    updatedAt: row.updatedAt.toISOString(),
  }));
  return c.json({ tables });
});
