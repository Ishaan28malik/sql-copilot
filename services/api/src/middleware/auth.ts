import { unauthorized } from '@sqlcopilot/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../env';
import { getUserBySessionToken } from '../modules/auth/service';

export const SESSION_COOKIE = 'sqlcopilot_session';

/**
 * Reads the session token from the Authorization: Bearer header (primary, used
 * by the cross-origin SPA) or the session cookie (fallback, same-origin).
 * Cookies are unreliable cross-site — Safari/Firefox and increasingly Chrome
 * block third-party cookies — so the token is what the deployed frontend uses.
 */
export function readSessionToken(c: Context<AppEnv>): string | null {
  const header = c.req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return getCookie(c, SESSION_COOKIE) ?? null;
}

/** Populates c.var.user from the session token or rejects with 401. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readSessionToken(c);
  if (!token) throw unauthorized();
  const user = await getUserBySessionToken(c.var.deps.db, token);
  if (!user) throw unauthorized('Session expired or invalid');
  c.set('user', user);
  await next();
};
