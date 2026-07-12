import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

export const EMBEDDING_DIMENSIONS = 384; // BAAI bge-small

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Tenant database connections
// ---------------------------------------------------------------------------

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dialect: text('dialect').notNull().default('postgres'),
    /** AES-256-GCM ciphertext of the JSON credentials; never stored in plaintext. */
    encryptedCredentials: text('encrypted_credentials').notNull(),
    /** Non-secret display fields so lists never require decryption. */
    host: text('host').notNull(),
    database: text('database').notNull(),
    lastIngestedAt: timestamp('last_ingested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('connections_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Ingested schema metadata + embeddings (one row per tenant table)
// ---------------------------------------------------------------------------

export const schemaTables = pgTable(
  'schema_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    schemaName: text('schema_name').notNull(),
    tableName: text('table_name').notNull(),
    /** Rendered text document sent to the LLM as schema context. */
    document: text('document').notNull(),
    /** Full structured metadata (columns, keys, indexes, samples). */
    metadata: jsonb('metadata').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('schema_tables_connection_idx').on(t.connectionId),
    index('schema_tables_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

// ---------------------------------------------------------------------------
// Chat history
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    sql: text('sql'),
    error: text('error'),
    rowCount: integer('row_count'),
    executionMs: integer('execution_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId)],
);

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

export const benchmarkRuns = pgTable(
  'benchmark_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    expectedSql: text('expected_sql').notNull(),
    generatedSql: text('generated_sql'),
    exactMatch: boolean('exact_match').notNull().default(false),
    executionAccuracy: boolean('execution_accuracy').notNull().default(false),
    resultAccuracy: boolean('result_accuracy').notNull().default(false),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('benchmark_runs_user_idx').on(t.userId)],
);
