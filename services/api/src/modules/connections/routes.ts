import { connections, testTenantConnection } from '@sqlcopilot/database';
import { badRequest, connectDbRequestSchema } from '@sqlcopilot/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { encryptJson } from '../../lib/crypto';
import { parseBody } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { toConnectionSummary } from './service';

export const connectionRoutes = new Hono<AppEnv>();
connectionRoutes.use('*', requireAuth);

connectionRoutes.post('/connect-db', async (c) => {
  const body = await parseBody(c, connectDbRequestSchema);
  const { db, logger, env } = c.var.deps;

  try {
    await testTenantConnection(body.credentials);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw badRequest(`Could not connect to database: ${message}`);
  }

  const [row] = await db
    .insert(connections)
    .values({
      userId: c.var.user.id,
      name: body.name,
      dialect: body.dialect,
      encryptedCredentials: await encryptJson(body.credentials, env.ENCRYPTION_KEY),
      host: body.credentials.host,
      database: body.credentials.database,
    })
    .returning();
  if (!row) throw badRequest('Failed to save connection');

  logger.info('connection created', { connectionId: row.id, userId: c.var.user.id });
  return c.json({ connection: toConnectionSummary(row) }, 201);
});

connectionRoutes.get('/connections', async (c) => {
  const rows = await c.var.deps.db
    .select()
    .from(connections)
    .where(eq(connections.userId, c.var.user.id));
  return c.json({ connections: rows.map(toConnectionSummary) });
});

connectionRoutes.delete('/connections/:id', async (c) => {
  await c.var.deps.db
    .delete(connections)
    .where(and(eq(connections.id, c.req.param('id')), eq(connections.userId, c.var.user.id)));
  return c.json({ ok: true });
});
