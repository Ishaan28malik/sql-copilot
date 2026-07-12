import type { CurrentUser, Logger } from '@sqlcopilot/shared';
import type { Deps } from './lib/deps';

export interface Env {
  DATABASE_URL: string;
  /**
   * Optional Hyperdrive binding. Preferred over DATABASE_URL when present:
   * workerd's node:tls path cannot complete TLS to some poolers (e.g.
   * Supabase supavisor), while Hyperdrive terminates TLS on Cloudflare infra.
   */
  HYPERDRIVE?: { connectionString: string };
  /** base64-encoded 32-byte AES key. */
  ENCRYPTION_KEY: string;
  // LLM provider — HuggingFace is used when HF_TOKEN is set; otherwise Ollama.
  HF_TOKEN?: string;
  HF_CHAT_MODEL?: string;
  HF_EMBED_MODEL?: string;
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_EMBED_MODEL?: string;
  CORS_ORIGIN?: string;
  SQLGLOT_URL?: string;
  LOG_LEVEL?: string;
}

/**
 * Resolves configuration from either Cloudflare Workers bindings (`c.env`) or
 * Node's `process.env`. Bindings win when both are present (Workers), so the
 * HYPERDRIVE object binding is preserved; on Node, everything comes from
 * process.env and HYPERDRIVE is simply absent.
 */
export function resolveEnv(bindings: Partial<Env> | undefined): Env {
  const proc =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return { ...proc, ...(bindings ?? {}) } as Env;
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
