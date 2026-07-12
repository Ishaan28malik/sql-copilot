import { sessions, users, type AppDatabase } from '@sqlcopilot/database';
import { badRequest, unauthorized, type CurrentUser } from '@sqlcopilot/shared';
import { and, eq, gt } from 'drizzle-orm';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '../../lib/crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  user: CurrentUser;
}

export async function signup(db: AppDatabase, email: string, password: string): Promise<IssuedSession> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized));
  if (existing.length > 0) throw badRequest('An account with this email already exists');

  const [user] = await db
    .insert(users)
    .values({ email: normalized, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, email: users.email });
  if (!user) throw badRequest('Failed to create account');
  return issueSession(db, user);
}

export async function login(db: AppDatabase, email: string, password: string): Promise<IssuedSession> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  // Hash even when the user is missing so response timing doesn't leak
  // account existence.
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password), false);
  if (!user || !valid) throw unauthorized('Invalid email or password');
  return issueSession(db, { id: user.id, email: user.email });
}

async function issueSession(db: AppDatabase, user: CurrentUser): Promise<IssuedSession> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId: user.id, tokenHash: await sha256Hex(token), expiresAt });
  return { token, expiresAt, user };
}

export async function getUserBySessionToken(db: AppDatabase, token: string): Promise<CurrentUser | null> {
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

export async function revokeSession(db: AppDatabase, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
}
