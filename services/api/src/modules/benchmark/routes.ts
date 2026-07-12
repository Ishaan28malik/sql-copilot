import { benchmarkRequestSchema } from '@sqlcopilot/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { parseBody } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { BenchmarkService } from './service';

export const benchmarkRoutes = new Hono<AppEnv>();
benchmarkRoutes.use('*', requireAuth);

benchmarkRoutes.post('/benchmark', async (c) => {
  const body = await parseBody(c, benchmarkRequestSchema);
  const service = new BenchmarkService(c.var.deps);
  const summary = await service.run(c.var.user.id, body);
  return c.json(summary);
});
