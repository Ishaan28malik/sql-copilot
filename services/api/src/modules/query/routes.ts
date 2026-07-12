import { askRequestSchema, executeRequestSchema } from '@sqlcopilot/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { QUERY_LIMITS } from '../../env';
import { parseBody } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { getConnectionCredentials, getOwnedConnection } from '../connections/service';
import { describeExecutionError, executeReadOnlySql } from './executor';
import { AskService } from './service';

export const queryRoutes = new Hono<AppEnv>();
queryRoutes.use('*', requireAuth);

queryRoutes.post('/ask', async (c) => {
  const body = await parseBody(c, askRequestSchema);
  const service = new AskService(c.var.deps);
  const outcome = await service.ask(c.var.user.id, body);

  if (!outcome.ok) {
    return c.json(
      {
        error: { code: 'SQL_GENERATION_FAILED', message: outcome.error.message },
        attempts: outcome.error.attempts,
      },
      422,
    );
  }
  return c.json(outcome.value);
});

/** Direct execution of user-edited SQL; runs through the same validator. */
queryRoutes.post('/execute', async (c) => {
  const body = await parseBody(c, executeRequestSchema);
  const { deps, user } = c.var;

  const connection = await getOwnedConnection(deps.db, user.id, body.connectionId);
  const validation = await deps.validator.validate(body.sql);
  if (!validation.ok) {
    return c.json({ error: { code: 'INVALID_SQL', message: validation.reason } }, 400);
  }

  const creds = await getConnectionCredentials(connection, deps.env.ENCRYPTION_KEY);
  try {
    const result = await executeReadOnlySql(creds, validation.sql, {
      maxRows: QUERY_LIMITS.maxRows,
      statementTimeoutMs: QUERY_LIMITS.statementTimeoutMs,
    });
    return c.json({ sql: validation.sql, result });
  } catch (error) {
    return c.json({ error: { code: 'EXECUTION_FAILED', message: describeExecutionError(error) } }, 400);
  }
});
