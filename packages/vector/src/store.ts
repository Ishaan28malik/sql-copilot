import { schemaTables, type AppDatabase } from '@sqlcopilot/database';
import type { TableMetadata } from '@sqlcopilot/shared';
import { and, cosineDistance, eq, sql } from 'drizzle-orm';

export interface SchemaEmbeddingRow {
  schemaName: string;
  tableName: string;
  document: string;
  metadata: TableMetadata;
  embedding: number[];
}

export interface RetrievedSchemaTable {
  id: string;
  schemaName: string;
  tableName: string;
  document: string;
  similarity: number;
}

/**
 * Replaces all schema embeddings for a connection (used by both initial
 * ingestion and reindexing) so stale tables never linger.
 */
export async function replaceSchemaEmbeddings(
  db: AppDatabase,
  connectionId: string,
  rows: SchemaEmbeddingRow[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schemaTables).where(eq(schemaTables.connectionId, connectionId));
    if (rows.length === 0) return;
    await tx.insert(schemaTables).values(
      rows.map((row) => ({
        connectionId,
        schemaName: row.schemaName,
        tableName: row.tableName,
        document: row.document,
        metadata: row.metadata,
        embedding: row.embedding,
      })),
    );
  });
}

/**
 * Cosine-similarity search over a connection's schema documents. Returns the
 * top-k most relevant tables for a question embedding.
 */
export async function searchSchemaTables(
  db: AppDatabase,
  connectionId: string,
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedSchemaTable[]> {
  const similarity = sql<number>`1 - (${cosineDistance(schemaTables.embedding, queryEmbedding)})`;
  const rows = await db
    .select({
      id: schemaTables.id,
      schemaName: schemaTables.schemaName,
      tableName: schemaTables.tableName,
      document: schemaTables.document,
      similarity,
    })
    .from(schemaTables)
    .where(and(eq(schemaTables.connectionId, connectionId)))
    .orderBy(sql`${similarity} DESC`)
    .limit(k);
  return rows;
}
