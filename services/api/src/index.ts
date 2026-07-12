import { AppError } from '@sqlcopilot/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from './env';
import { createDeps } from './lib/deps';
import { authRoutes } from './modules/auth/routes';
import { benchmarkRoutes } from './modules/benchmark/routes';
import { connectionRoutes } from './modules/connections/routes';
import { historyRoutes } from './modules/history/routes';
import { ingestionRoutes } from './modules/ingestion/routes';
import { queryRoutes } from './modules/query/routes';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const allowed = (c.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const handler = cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0] ?? ''),
    credentials: true,
  });
  return handler(c, next);
});

// Request-scoped dependencies; the DB connection is closed after the response
// is sent (waitUntil) so it never blocks the reply.
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const { deps, close } = createDeps(c.env, requestId);
  c.set('deps', deps);
  c.set('logger', deps.logger);
  try {
    await next();
  } finally {
    try {
      c.executionCtx.waitUntil(close());
    } catch {
      await close();
    }
  }
});

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json(
      { error: { code: error.code, message: error.message } },
      error.status as ContentfulStatusCode,
    );
  }
  const logger = c.var.logger;
  logger?.error('unhandled error', {
    path: c.req.path,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

app.route('/auth', authRoutes);
app.route('/', connectionRoutes); // POST /connect-db, GET/DELETE /connections
app.route('/', ingestionRoutes); //  POST /ingest-schema, POST /reindex, GET /schema
app.route('/', queryRoutes); //      POST /ask, POST /execute
app.route('/', historyRoutes); //    GET /history, GET /history/:id
app.route('/', benchmarkRoutes); //  POST /benchmark

export default app;
