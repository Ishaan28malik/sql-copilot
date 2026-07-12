// node-sql-parser is CommonJS; a default import + destructure works under both
// esbuild (Workers) and native Node ESM (tsx on Render).
import NodeSqlParser from 'node-sql-parser';
import type { AST } from 'node-sql-parser';

const { Parser } = NodeSqlParser;

const PARSER_OPTIONS = { database: 'PostgresQL' } as const;
const MAX_SQL_LENGTH = 20_000;
const DEFAULT_MAX_ROWS = 1000;

/**
 * Defense-in-depth keyword denylist applied to the raw SQL. The AST check is
 * the primary gate; this catches statements the parser mis-handles. May
 * false-positive on string literals containing these words — acceptable,
 * since it only ever fails closed.
 */
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|call|copy|vacuum|lock|do|execute|reindex|listen|notify|refresh)\b/i;

export type ValidationResult = { ok: true; sql: string } | { ok: false; reason: string };

export interface SqlValidator {
  /** Returns the (possibly rewritten, e.g. LIMIT-capped) SQL when safe. */
  validate(sql: string): Promise<ValidationResult>;
}

const invalid = (reason: string): ValidationResult => ({ ok: false, reason });

/**
 * AST-based allowlist validator: exactly one statement, and it must be a
 * SELECT (WITH ... SELECT included). Anything unparseable is rejected —
 * failing closed is the point.
 */
export class AstSqlValidator implements SqlValidator {
  private readonly parser = new Parser();

  constructor(private readonly maxRows: number = DEFAULT_MAX_ROWS) {}

  async validate(sql: string): Promise<ValidationResult> {
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    if (!trimmed) return invalid('Empty SQL statement');
    if (trimmed.length > MAX_SQL_LENGTH) return invalid('SQL statement is too long');

    const keywordHit = trimmed.match(FORBIDDEN_KEYWORDS);
    if (keywordHit) return invalid(`Forbidden keyword: ${keywordHit[0].toUpperCase()}. Only read-only SELECT queries are allowed.`);

    let ast: AST | AST[];
    try {
      ast = this.parser.astify(trimmed, PARSER_OPTIONS);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unparseable SQL';
      return invalid(`SQL syntax error: ${message}`);
    }

    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) return invalid('Exactly one SQL statement is allowed');
    const statement = statements[0];
    if (!statement || statement.type !== 'select') {
      return invalid(`Statement type "${statement?.type ?? 'unknown'}" is not allowed; only SELECT is permitted`);
    }

    // tableList encodes the operation per referenced table
    // ("select::schema::table"); anything non-select (e.g. a data-modifying
    // CTE) is rejected.
    try {
      const authorities = this.parser.tableList(trimmed, PARSER_OPTIONS);
      if (authorities.some((a) => !a.startsWith('select::'))) {
        return invalid('Query touches tables with a non-SELECT operation');
      }
    } catch {
      return invalid('Could not verify table access for this query');
    }

    return { ok: true, sql: this.enforceRowLimit(statement, trimmed) };
  }

  /** Injects or clamps LIMIT so a runaway query can't stream millions of rows. */
  private enforceRowLimit(statement: AST, original: string): string {
    try {
      const select = statement as AST & {
        limit?: { seperator: string; value: { type: string; value: number }[] } | null;
      };
      if (!select.limit || select.limit.value.length === 0) {
        select.limit = { seperator: '', value: [{ type: 'number', value: this.maxRows }] };
      } else {
        const first = select.limit.value[0];
        if (first && first.type === 'number' && first.value > this.maxRows) {
          first.value = this.maxRows;
        }
      }
      return this.parser.sqlify(statement, PARSER_OPTIONS);
    } catch {
      // Row cap is also enforced in the executor, so failing to rewrite is
      // not a safety hole.
      return original;
    }
  }
}

interface SqlglotResponse {
  valid: boolean;
  read_only: boolean;
  error: string | null;
}

/**
 * Optional second opinion from the SQLGlot microservice (services/sqlglot).
 * SQLGlot itself is Python, so it cannot run inside the Worker.
 */
export class SqlglotValidator implements SqlValidator {
  constructor(private readonly baseUrl: string) {}

  async validate(sql: string): Promise<ValidationResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql, dialect: 'postgres' }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return invalid(`SQLGlot validation service error (${response.status})`);
    const data = (await response.json()) as SqlglotResponse;
    if (!data.valid) return invalid(`SQL syntax error: ${data.error ?? 'invalid SQL'}`);
    if (!data.read_only) return invalid('Only read-only SELECT queries are allowed');
    return { ok: true, sql };
  }
}

/** Runs every validator in order; the first failure wins. */
export class CompositeValidator implements SqlValidator {
  constructor(private readonly validators: SqlValidator[]) {}

  async validate(sql: string): Promise<ValidationResult> {
    let current = sql;
    for (const validator of this.validators) {
      const result = await validator.validate(current);
      if (!result.ok) return result;
      current = result.sql;
    }
    return { ok: true, sql: current };
  }
}

export function createValidator(sqlglotUrl: string | undefined, maxRows = DEFAULT_MAX_ROWS): SqlValidator {
  const validators: SqlValidator[] = [new AstSqlValidator(maxRows)];
  if (sqlglotUrl) validators.push(new SqlglotValidator(sqlglotUrl));
  return new CompositeValidator(validators);
}
