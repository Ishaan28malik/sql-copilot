import { benchmarkRuns } from '@sqlcopilot/database';
import type {
  BenchmarkCaseResult,
  BenchmarkRequest,
  BenchmarkSummary,
  ConnectionCredentials,
  QueryResultData,
} from '@sqlcopilot/shared';
import { QUERY_LIMITS } from '../../env';
import type { Deps } from '../../lib/deps';
import { getConnectionCredentials, getOwnedConnection } from '../connections/service';
import { describeExecutionError, executeReadOnlySql } from '../query/executor';
import { SqlPipeline } from '../query/service';

/** Whitespace/case/trailing-semicolon-insensitive SQL string comparison. */
export function normalizeSql(sql: string): string {
  return sql.trim().replace(/;+\s*$/, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Order-insensitive row-multiset comparison; ignores column names (aliases). */
export function resultsMatch(a: QueryResultData, b: QueryResultData): boolean {
  if (a.rowCount !== b.rowCount) return false;
  const canon = (r: QueryResultData) => r.rows.map((row) => JSON.stringify(row)).sort();
  const [ca, cb] = [canon(a), canon(b)];
  return ca.every((row, i) => row === cb[i]);
}

export class BenchmarkService {
  private readonly pipeline: SqlPipeline;

  constructor(private readonly deps: Deps) {
    this.pipeline = new SqlPipeline(deps);
  }

  async run(userId: string, request: BenchmarkRequest): Promise<BenchmarkSummary> {
    const connection = await getOwnedConnection(this.deps.db, userId, request.connectionId);
    const creds = await getConnectionCredentials(connection, this.deps.env.ENCRYPTION_KEY);

    const cases: BenchmarkCaseResult[] = [];
    // Sequential on purpose: a single-VM Ollama degrades badly under
    // concurrent generations.
    for (const benchCase of request.cases) {
      const result = await this.runCase(connection.id, creds, benchCase.question, benchCase.expectedSql);
      cases.push(result);
      await this.deps.db.insert(benchmarkRuns).values({
        userId,
        connectionId: connection.id,
        question: result.question,
        expectedSql: result.expectedSql,
        generatedSql: result.generatedSql,
        exactMatch: result.exactMatch,
        executionAccuracy: result.executionAccuracy,
        resultAccuracy: result.resultAccuracy,
        error: result.error,
      });
    }

    return {
      total: cases.length,
      exactMatches: cases.filter((c) => c.exactMatch).length,
      executionAccurate: cases.filter((c) => c.executionAccuracy).length,
      resultAccurate: cases.filter((c) => c.resultAccuracy).length,
      cases,
    };
  }

  private async runCase(
    connectionId: string,
    creds: ConnectionCredentials,
    question: string,
    expectedSql: string,
  ): Promise<BenchmarkCaseResult> {
    const base: BenchmarkCaseResult = {
      question,
      expectedSql,
      generatedSql: null,
      exactMatch: false,
      executionAccuracy: false,
      resultAccuracy: false,
      error: null,
    };

    // The expected SQL goes through the same validator: benchmarks must not
    // become a side door around read-only enforcement.
    const expectedValidation = await this.deps.validator.validate(expectedSql);
    if (!expectedValidation.ok) {
      return { ...base, error: `Expected SQL rejected: ${expectedValidation.reason}` };
    }

    let expectedResult: QueryResultData;
    try {
      expectedResult = await executeReadOnlySql(creds, expectedValidation.sql, {
        maxRows: QUERY_LIMITS.maxRows,
        statementTimeoutMs: QUERY_LIMITS.statementTimeoutMs,
      });
    } catch (error) {
      return { ...base, error: `Expected SQL failed to execute: ${describeExecutionError(error)}` };
    }

    try {
      const schemaContext = await this.pipeline.retrieveSchemaContext(connectionId, question);
      const outcome = await this.pipeline.generateAndExecute(creds, schemaContext, question, 'postgres');
      return {
        ...base,
        generatedSql: outcome.sql || null,
        exactMatch: normalizeSql(outcome.sql) === normalizeSql(expectedSql),
        executionAccuracy: outcome.result !== null,
        resultAccuracy: outcome.result !== null && resultsMatch(outcome.result, expectedResult),
        error: outcome.finalError,
      };
    } catch (error) {
      return { ...base, error: describeExecutionError(error) };
    }
  }
}
