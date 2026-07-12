import type { CurrentUser, Logger } from '@sqlcopilot/shared';
import type { Deps } from './lib/deps';

export interface Env {
  DATABASE_URL: string;
  /** base64-encoded 32-byte AES key. */
  ENCRYPTION_KEY: string;
  OLLAMA_URL: string;
  OLLAMA_MODEL?: string;
  OLLAMA_EMBED_MODEL?: string;
  CORS_ORIGIN?: string;
  SQLGLOT_URL?: string;
  LOG_LEVEL?: string;
}

/** Hono generic: bindings plus per-request variables. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    deps: Deps;
    logger: Logger;
    user: CurrentUser;
  };
};

export const QUERY_LIMITS = {
  /** Hard cap on rows returned to the client. */
  maxRows: 1000,
  /** statement_timeout applied inside the read-only transaction. */
  statementTimeoutMs: 15_000,
  /** Total generation attempts: 1 initial + up to 3 self-healing retries. */
  maxAttempts: 4,
  /** Number of schema documents retrieved for prompt context. */
  retrievalK: 8,
} as const;
