import { OllamaProvider, type EmbeddingProvider, type LlmProvider } from '@sqlcopilot/ai';
import { createAppDb, type AppDatabase } from '@sqlcopilot/database';
import { createLogger, type Logger, type LogLevel } from '@sqlcopilot/shared';
import type { Env } from '../env';
import { createValidator, type SqlValidator } from '../modules/query/validator';

/**
 * Request-scoped dependency container. Every handler receives its
 * collaborators through this object, which keeps modules decoupled from the
 * Worker environment and makes them trivially unit-testable with fakes.
 */
export interface Deps {
  db: AppDatabase;
  llm: LlmProvider;
  embedder: EmbeddingProvider;
  validator: SqlValidator;
  logger: Logger;
  env: Env;
}

export function createDeps(env: Env, requestId: string): { deps: Deps; close: () => Promise<void> } {
  const logger = createLogger((env.LOG_LEVEL as LogLevel | undefined) ?? 'info', { requestId });
  const { db, close } = createAppDb(env.DATABASE_URL);
  const ollama = new OllamaProvider({
    baseUrl: env.OLLAMA_URL,
    model: env.OLLAMA_MODEL ?? 'qwen2.5:7b',
    embedModel: env.OLLAMA_EMBED_MODEL ?? 'bge-small-en-v1.5',
    logger,
  });

  return {
    deps: {
      db,
      llm: ollama,
      embedder: ollama,
      validator: createValidator(env.SQLGLOT_URL),
      logger,
      env,
    },
    close,
  };
}
