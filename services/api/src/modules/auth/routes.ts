import { loginRequestSchema, signupRequestSchema } from '@sqlcopilot/shared';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../../env';
import { parseBody } from '../../lib/validate';
import { requireAuth, SESSION_COOKIE } from '../../middleware/auth';
import { login, revokeSession, signup, type IssuedSession } from './service';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'None',
  path: '/',
} as const;

export const authRoutes = new Hono<AppEnv>();

const respondWithSession = (c: Context<AppEnv>, session: IssuedSession) => {
  setCookie(c, SESSION_COOKIE, session.token, { ...COOKIE_OPTIONS, expires: session.expiresAt });
  return c.json({ user: session.user });
};

authRoutes.post('/signup', async (c) => {
  const body = await parseBody(c, signupRequestSchema);
  const session = await signup(c.var.deps.db, body.email, body.password);
  c.var.logger.info('user signed up', { userId: session.user.id });
  return respondWithSession(c, session);
});

authRoutes.post('/login', async (c) => {
  const body = await parseBody(c, loginRequestSchema);
  const session = await login(c.var.deps.db, body.email, body.password);
  return respondWithSession(c, session);
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(c.var.deps.db, token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => c.json({ user: c.var.user }));
