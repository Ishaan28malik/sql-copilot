import { conversations, messages } from '@sqlcopilot/database';
import { notFound, type ConversationDetail, type ConversationSummary } from '@sqlcopilot/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { requireAuth } from '../../middleware/auth';

export const historyRoutes = new Hono<AppEnv>();
historyRoutes.use('*', requireAuth);

historyRoutes.get('/history', async (c) => {
  const rows = await c.var.deps.db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      title: conversations.title,
      createdAt: conversations.createdAt,
      messageCount: count(messages.id),
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.userId, c.var.user.id))
    .groupBy(conversations.id)
    .orderBy(desc(conversations.createdAt))
    .limit(100);

  const result: ConversationSummary[] = rows.map((row) => ({
    id: row.id,
    connectionId: row.connectionId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    messageCount: Number(row.messageCount),
  }));
  return c.json({ conversations: result });
});

historyRoutes.get('/history/:id', async (c) => {
  const { deps, user } = c.var;
  const conversationId = c.req.param('id');

  const [conversation] = await deps.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
  if (!conversation) throw notFound('Conversation not found');

  const rows = await deps.db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const detail: ConversationDetail = {
    id: conversation.id,
    connectionId: conversation.connectionId,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    messages: rows.map((m) => ({
      id: m.id,
      question: m.question,
      sql: m.sql,
      error: m.error,
      rowCount: m.rowCount,
      executionMs: m.executionMs,
      createdAt: m.createdAt.toISOString(),
    })),
  };
  return c.json(detail);
});
