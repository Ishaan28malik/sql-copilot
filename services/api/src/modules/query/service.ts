import {
  buildSqlGenerationPrompt,
  buildSqlRepairPrompt,
  parseSqlFromCompletion,
  SQL_SYSTEM_PROMPT,
} from '@sqlcopilot/prompts';
import { conversations, messages } from '@sqlcopilot/database';
import {
  badRequest,
  notFound,
  type AskAttempt,
  type AskRequest,
  type AskResponse,
  type ConnectionCredentials,
  type QueryResultData,
  type Result,
  type SqlDialect,
} from '@sqlcopilot/shared';
import { searchSchemaTables } from '@sqlcopilot/vector';
import { and, eq } from 'drizzle-orm';
import { QUERY_LIMITS } from '../../env';
import type { Deps } from '../../lib/deps';
import { getConnectionCredentials, getOwnedConnection } from '../connections/service';
import { describeExecutionError, executeReadOnlySql } from './executor';

export interface PipelineOutcome {
  sql: string;
  attempts: AskAttempt[];
  result: QueryResultData | null;
  /** Error from the final attempt when result is null. */
  finalError: string | null;
}

/**
 * The core NL -> SQL pipeline: retrieve schema context, generate, validate,
 * execute, and self-heal by feeding validation/execution errors back to the
 * model. Stateless — persistence lives in AskService so BenchmarkService can
 * reuse the pipeline directly.
 */
export class SqlPipeline {
  constructor(private readonly deps: Deps) {}

  async retrieveSchemaContext(connectionId: string, question: string): Promise<string> {
    const [embedding] = await this.deps.embedder.embed([question]);
    if (!embedding) throw badRequest('Failed to embed question');
    const tables = await searchSchemaTables(this.deps.db, connectionId, embedding, QUERY_LIMITS.retrievalK);
    if (tables.length === 0) {
      throw badRequest('No schema indexed for this connection yet. Run schema ingestion first.');
    }
    return tables.map((t) => t.document).join('\n\n');
  }

  async generateAndExecute(
    creds: ConnectionCredentials,
    schemaContext: string,
    question: string,
    dialect: SqlDialect,
  ): Promise<PipelineOutcome> {
    const attempts: AskAttempt[] = [];
    let prompt = buildSqlGenerationPrompt({ question, schemaContext, dialect });

    for (let attempt = 1; attempt <= QUERY_LIMITS.maxAttempts; attempt++) {
      const completion = await this.deps.llm.generate({ prompt, system: SQL_SYSTEM_PROMPT });
      const candidate = parseSqlFromCompletion(completion);
      this.deps.logger.debug('sql candidate generated', { attempt, candidate });

      const validation = await this.deps.validator.validate(candidate);
      if (!validation.ok) {
        attempts.push({ sql: candidate, error: validation.reason });
        prompt = buildSqlRepairPrompt({
          question,
          schemaContext,
          dialect,
          failedSql: candidate,
          error: validation.reason,
        });
        continue;
      }

      try {
        const result = await executeReadOnlySql(creds, validation.sql, {
          maxRows: QUERY_LIMITS.maxRows,
          statementTimeoutMs: QUERY_LIMITS.statementTimeoutMs,
        });
        attempts.push({ sql: validation.sql, error: null });
        return { sql: validation.sql, attempts, result, finalError: null };
      } catch (error) {
        const message = describeExecutionError(error);
        this.deps.logger.info('execution failed, self-healing', { attempt, error: message });
        attempts.push({ sql: validation.sql, error: message });
        prompt = buildSqlRepairPrompt({
          question,
          schemaContext,
          dialect,
          failedSql: validation.sql,
          error: message,
        });
      }
    }

    const last = attempts[attempts.length - 1];
    return {
      sql: last?.sql ?? '',
      attempts,
      result: null,
      finalError: last?.error ?? 'SQL generation failed',
    };
  }
}

export interface AskFailure {
  message: string;
  attempts: AskAttempt[];
}

export class AskService {
  private readonly pipeline: SqlPipeline;

  constructor(private readonly deps: Deps) {
    this.pipeline = new SqlPipeline(deps);
  }

  async ask(userId: string, request: AskRequest): Promise<Result<AskResponse, AskFailure>> {
    const { db, env } = this.deps;
    const connection = await getOwnedConnection(db, userId, request.connectionId);
    const creds = await getConnectionCredentials(connection, env.ENCRYPTION_KEY);
    const dialect: SqlDialect = 'postgres';

    const schemaContext = await this.pipeline.retrieveSchemaContext(connection.id, request.question);
    const outcome = await this.pipeline.generateAndExecute(creds, schemaContext, request.question, dialect);

    const conversationId = await this.resolveConversation(userId, connection.id, request);
    const [message] = await db
      .insert(messages)
      .values({
        conversationId,
        question: request.question,
        sql: outcome.sql || null,
        error: outcome.finalError,
        rowCount: outcome.result?.rowCount ?? null,
        executionMs: outcome.result?.executionMs ?? null,
      })
      .returning({ id: messages.id });

    if (!outcome.result) {
      return {
        ok: false,
        error: { message: outcome.finalError ?? 'SQL generation failed', attempts: outcome.attempts },
      };
    }

    return {
      ok: true,
      value: {
        conversationId,
        messageId: message?.id ?? '',
        sql: outcome.sql,
        attempts: outcome.attempts,
        result: outcome.result,
      },
    };
  }

  private async resolveConversation(userId: string, connectionId: string, request: AskRequest): Promise<string> {
    const { db } = this.deps;
    if (request.conversationId) {
      const [existing] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, request.conversationId), eq(conversations.userId, userId)));
      if (!existing) throw notFound('Conversation not found');
      return existing.id;
    }
    const [created] = await db
      .insert(conversations)
      .values({ userId, connectionId, title: request.question.slice(0, 80) })
      .returning({ id: conversations.id });
    if (!created) throw badRequest('Failed to create conversation');
    return created.id;
  }
}
