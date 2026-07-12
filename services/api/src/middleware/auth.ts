import { unauthorized } from '@sqlcopilot/shared';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../env';
import { getUserBySessionToken } from '../modules/auth/service';

export const SESSION_COOKIE = 'sqlcopilot_session';

/** Populates c.var.user from the session cookie or rejects with 401. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw unauthorized();
  const user = await getUserBySessionToken(c.var.deps.db, token);
  if (!user) throw unauthorized('Session expired or invalid');
  c.set('user', user);
  await next();
};
