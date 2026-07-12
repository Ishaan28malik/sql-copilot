import { z } from 'zod';

// ---------------------------------------------------------------------------
// Dialects
// ---------------------------------------------------------------------------

export const sqlDialectSchema = z.enum(['postgres']);
export type SqlDialect = z.infer<typeof sqlDialectSchema>;

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export const connectionCredentialsSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().default(true),
});
export type ConnectionCredentials = z.infer<typeof connectionCredentialsSchema>;

export const connectDbRequestSchema = z.object({
  name: z.string().min(1).max(100),
  dialect: sqlDialectSchema.default('postgres'),
  credentials: connectionCredentialsSchema,
});
export type ConnectDbRequest = z.infer<typeof connectDbRequestSchema>;

export interface ConnectionSummary {
  id: string;
  name: string;
  dialect: SqlDialect;
  host: string;
  database: string;
  lastIngestedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signupRequestSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface CurrentUser {
  id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Schema ingestion
// ---------------------------------------------------------------------------

export const ingestSchemaRequestSchema = z.object({
  connectionId: z.string().uuid(),
});
export type IngestSchemaRequest = z.infer<typeof ingestSchemaRequestSchema>;

export interface ColumnMetadata {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

export interface ForeignKeyMetadata {
  column: string;
  referencesSchema: string;
  referencesTable: string;
  referencesColumn: string;
}

export interface TableMetadata {
  schema: string;
  name: string;
  columns: ColumnMetadata[];
  foreignKeys: ForeignKeyMetadata[];
  indexes: string[];
  sampleRows: Record<string, string | null>[];
}

export interface IngestResult {
  connectionId: string;
  tablesIndexed: number;
  durationMs: number;
}

export interface SchemaTableSummary {
  id: string;
  schema: string;
  table: string;
  columnCount: number;
  document: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Ask / execute
// ---------------------------------------------------------------------------

export const askRequestSchema = z.object({
  connectionId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

export const executeRequestSchema = z.object({
  connectionId: z.string().uuid(),
  sql: z.string().min(1).max(20000),
});
export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

export type SqlCell = string | number | boolean | null;

export interface QueryResultData {
  columns: string[];
  rows: SqlCell[][];
  rowCount: number;
  truncated: boolean;
  executionMs: number;
}

export interface AskAttempt {
  sql: string;
  error: string | null;
}

export interface AskResponse {
  conversationId: string;
  messageId: string;
  sql: string;
  attempts: AskAttempt[];
  result: QueryResultData;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryMessage {
  id: string;
  question: string;
  sql: string | null;
  error: string | null;
  rowCount: number | null;
  executionMs: number | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  connectionId: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

export interface ConversationDetail {
  id: string;
  connectionId: string;
  title: string;
  createdAt: string;
  messages: HistoryMessage[];
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

export const benchmarkRequestSchema = z.object({
  connectionId: z.string().uuid(),
  cases: z
    .array(
      z.object({
        question: z.string().min(1),
        expectedSql: z.string().min(1),
      }),
    )
    .min(1)
    .max(50),
});
export type BenchmarkRequest = z.infer<typeof benchmarkRequestSchema>;

export interface BenchmarkCaseResult {
  question: string;
  expectedSql: string;
  generatedSql: string | null;
  exactMatch: boolean;
  executionAccuracy: boolean;
  resultAccuracy: boolean;
  error: string | null;
}

export interface BenchmarkSummary {
  total: number;
  exactMatches: number;
  executionAccurate: number;
  resultAccurate: number;
  cases: BenchmarkCaseResult[];
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
