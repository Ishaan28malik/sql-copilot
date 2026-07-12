import type {
  AskAttempt,
  AskRequest,
  AskResponse,
  BenchmarkRequest,
  BenchmarkSummary,
  ConnectDbRequest,
  ConnectionSummary,
  ConversationDetail,
  ConversationSummary,
  CurrentUser,
  ExecuteRequest,
  IngestResult,
  QueryResultData,
  SchemaTableSummary,
} from '@sqlcopilot/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    /** Populated on 422 SQL_GENERATION_FAILED responses. */
    public readonly attempts?: AskAttempt[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    credentials: 'include',
    headers: options.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string }; attempts?: AskAttempt[] } | null = null;
    try {
      payload = await response.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? `Request failed (${response.status})`,
      response.status,
      payload?.attempts,
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  // auth
  me: () => request<{ user: CurrentUser }>('/auth/me'),
  signup: (email: string, password: string) =>
    request<{ user: CurrentUser }>('/auth/signup', { body: { email, password } }),
  login: (email: string, password: string) =>
    request<{ user: CurrentUser }>('/auth/login', { body: { email, password } }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: {} }),

  // connections
  connections: () => request<{ connections: ConnectionSummary[] }>('/connections'),
  connectDb: (body: ConnectDbRequest) => request<{ connection: ConnectionSummary }>('/connect-db', { body }),
  deleteConnection: (id: string) => request<{ ok: boolean }>(`/connections/${id}`, { method: 'DELETE' }),

  // schema
  ingestSchema: (connectionId: string) => request<IngestResult>('/ingest-schema', { body: { connectionId } }),
  reindex: (connectionId: string) => request<IngestResult>('/reindex', { body: { connectionId } }),
  schema: (connectionId: string) =>
    request<{ tables: SchemaTableSummary[] }>(`/schema?connectionId=${encodeURIComponent(connectionId)}`),

  // query
  ask: (body: AskRequest) => request<AskResponse>('/ask', { body }),
  execute: (body: ExecuteRequest) => request<{ sql: string; result: QueryResultData }>('/execute', { body }),

  // history
  history: () => request<{ conversations: ConversationSummary[] }>('/history'),
  conversation: (id: string) => request<ConversationDetail>(`/history/${id}`),

  // benchmark
  benchmark: (body: BenchmarkRequest) => request<BenchmarkSummary>('/benchmark', { body }),
};
