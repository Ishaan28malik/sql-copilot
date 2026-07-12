import { createTenantSql } from '@sqlcopilot/database';
import type {
  ColumnMetadata,
  ConnectionCredentials,
  ForeignKeyMetadata,
  Logger,
  TableMetadata,
} from '@sqlcopilot/shared';

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema'];
const MAX_TABLES = 500;
const SAMPLE_ROWS = 3;
const SAMPLE_VALUE_MAX_LENGTH = 80;

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/**
 * Introspects a tenant PostgreSQL database: tables, columns, keys, indexes,
 * and a few sample rows per table for LLM grounding.
 */
export async function extractSchema(
  creds: ConnectionCredentials,
  logger?: Logger,
): Promise<TableMetadata[]> {
  const sql = createTenantSql(creds);
  try {
    const [columns, primaryKeys, foreignKeys, indexes] = await Promise.all([
      sql<
        { table_schema: string; table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
      >`
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE t.table_type = 'BASE TABLE'
          AND c.table_schema NOT IN ${sql(SYSTEM_SCHEMAS)}
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `,
      sql<{ table_schema: string; table_name: string; column_name: string }[]>`
        SELECT tc.table_schema, tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema NOT IN ${sql(SYSTEM_SCHEMAS)}
      `,
      sql<
        { table_schema: string; table_name: string; column_name: string; foreign_schema: string; foreign_table: string; foreign_column: string }[]
      >`
        SELECT tc.table_schema, tc.table_name, kcu.column_name,
               ccu.table_schema AS foreign_schema, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ${sql(SYSTEM_SCHEMAS)}
      `,
      sql<{ schemaname: string; tablename: string; indexdef: string }[]>`
        SELECT schemaname, tablename, indexdef
        FROM pg_indexes
        WHERE schemaname NOT IN ${sql(SYSTEM_SCHEMAS)}
      `,
    ]);

    const tables = new Map<string, TableMetadata>();
    const keyOf = (schema: string, table: string) => `${schema}.${table}`;

    for (const col of columns) {
      const key = keyOf(col.table_schema, col.table_name);
      let table = tables.get(key);
      if (!table) {
        if (tables.size >= MAX_TABLES) continue;
        table = {
          schema: col.table_schema,
          name: col.table_name,
          columns: [],
          foreignKeys: [],
          indexes: [],
          sampleRows: [],
        };
        tables.set(key, table);
      }
      const column: ColumnMetadata = {
        name: col.column_name,
        dataType: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
        isPrimaryKey: false,
      };
      table.columns.push(column);
    }

    for (const pk of primaryKeys) {
      const table = tables.get(keyOf(pk.table_schema, pk.table_name));
      const column = table?.columns.find((c) => c.name === pk.column_name);
      if (column) column.isPrimaryKey = true;
    }

    for (const fk of foreignKeys) {
      const table = tables.get(keyOf(fk.table_schema, fk.table_name));
      if (!table) continue;
      const entry: ForeignKeyMetadata = {
        column: fk.column_name,
        referencesSchema: fk.foreign_schema,
        referencesTable: fk.foreign_table,
        referencesColumn: fk.foreign_column,
      };
      table.foreignKeys.push(entry);
    }

    for (const idx of indexes) {
      const table = tables.get(keyOf(idx.schemaname, idx.tablename));
      if (table) table.indexes.push(idx.indexdef);
    }

    // Sample rows are best-effort: a permission error on one table must not
    // fail the whole ingestion.
    for (const table of tables.values()) {
      try {
        const rows = await sql.unsafe(
          `SELECT * FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)} LIMIT ${SAMPLE_ROWS}`,
        );
        table.sampleRows = rows.map((row) => {
          const rendered: Record<string, string | null> = {};
          for (const [name, value] of Object.entries(row)) {
            rendered[name] = value === null || value === undefined ? null : String(value).slice(0, SAMPLE_VALUE_MAX_LENGTH);
          }
          return rendered;
        });
      } catch (error) {
        logger?.warn('sampling failed for table', {
          table: `${table.schema}.${table.name}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return [...tables.values()];
  } finally {
    await sql.end({ timeout: 5 });
  }
}
