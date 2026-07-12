import { createTenantSql } from '@sqlcopilot/database';
import type { ConnectionCredentials, QueryResultData, SqlCell } from '@sqlcopilot/shared';

export interface ExecuteOptions {
  maxRows: number;
  statementTimeoutMs: number;
}

function toCell(value: unknown): SqlCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

/**
 * Executes already-validated SQL against a tenant database.
 *
 * Runs inside a READ ONLY transaction with a statement_timeout as the final
 * runtime backstop behind the AST validator: even if a mutating statement
 * slipped through, Postgres itself would refuse it.
 */
export async function executeReadOnlySql(
  creds: ConnectionCredentials,
  sqlText: string,
  options: ExecuteOptions,
): Promise<QueryResultData> {
  const sql = createTenantSql(creds);
  try {
    const started = performance.now();
    const raw = await sql.begin('read only', async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = '${Math.floor(options.statementTimeoutMs)}ms'`);
      return tx.unsafe(sqlText);
    });
    const executionMs = Math.round(performance.now() - started);

    const allRows = raw as unknown as Record<string, unknown>[];
    const truncated = allRows.length > options.maxRows;
    const limited = truncated ? allRows.slice(0, options.maxRows) : allRows;

    const columnMeta = (raw as unknown as { columns?: { name: string }[] }).columns;
    const columns =
      columnMeta?.map((c) => c.name) ?? (limited.length > 0 ? Object.keys(limited[0] ?? {}) : []);

    return {
      columns,
      rows: limited.map((row) => columns.map((name) => toCell(row[name]))),
      rowCount: limited.length,
      truncated,
      executionMs,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Normalizes driver errors into a message safe to show users and feed the LLM. */
export function describeExecutionError(error: unknown): string {
  if (error instanceof Error) {
    // postgres.js errors carry the server message; strip anything that looks
    // like connection details.
    return error.message.replace(/postgres(ql)?:\/\/\S+/gi, '[redacted]').slice(0, 500);
  }
  return 'Query execution failed';
}
