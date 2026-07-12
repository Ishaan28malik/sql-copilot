import type { EmbeddingProvider } from '@sqlcopilot/ai';
import { connections, type AppDatabase } from '@sqlcopilot/database';
import type { ConnectionCredentials, IngestResult, Logger } from '@sqlcopilot/shared';
import { replaceSchemaEmbeddings, type SchemaEmbeddingRow } from '@sqlcopilot/vector';
import { eq } from 'drizzle-orm';
import { renderTableDocument } from './document';
import { extractSchema } from './extractor';

const EMBED_BATCH_SIZE = 16;

export interface IngestDeps {
  db: AppDatabase;
  embedder: EmbeddingProvider;
  logger?: Logger;
}

/**
 * Full ingestion pipeline for one connection:
 * extract schema -> render documents -> embed -> replace vectors.
 * Used by both POST /ingest-schema and POST /reindex (idempotent by design).
 */
export async function ingestSchema(
  deps: IngestDeps,
  connectionId: string,
  creds: ConnectionCredentials,
): Promise<IngestResult> {
  const started = performance.now();
  const tables = await extractSchema(creds, deps.logger);
  deps.logger?.info('schema extracted', { connectionId, tables: tables.length });

  const documents = tables.map(renderTableDocument);
  const embeddings: number[][] = [];
  for (let i = 0; i < documents.length; i += EMBED_BATCH_SIZE) {
    const batch = documents.slice(i, i + EMBED_BATCH_SIZE);
    embeddings.push(...(await deps.embedder.embed(batch)));
  }

  const rows: SchemaEmbeddingRow[] = tables.map((table, i) => ({
    schemaName: table.schema,
    tableName: table.name,
    document: documents[i]!,
    metadata: table,
    embedding: embeddings[i]!,
  }));

  await replaceSchemaEmbeddings(deps.db, connectionId, rows);
  await deps.db
    .update(connections)
    .set({ lastIngestedAt: new Date() })
    .where(eq(connections.id, connectionId));

  return {
    connectionId,
    tablesIndexed: rows.length,
    durationMs: Math.round(performance.now() - started),
  };
}
