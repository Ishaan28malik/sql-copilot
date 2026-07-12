import {
  HuggingFaceProvider,
  OllamaProvider,
  type EmbeddingProvider,
  type LlmProvider,
} from '@sqlcopilot/ai';
import { createAppDb, type AppDatabase } from '@sqlcopilot/database';
import { AppError, createLogger, type Logger, type LogLevel } from '@sqlcopilot/shared';
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
  const { db, close } = createAppDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL);
  const ai = createAiProvider(env, logger);

  return {
    deps: {
      db,
      llm: ai,
      embedder: ai,
      validator: createValidator(env.SQLGLOT_URL),
      logger,
      env,
    },
    close,
  };
}

/**
 * Selects the AI backend. HuggingFace (hosted, no infra) is preferred when a
 * token is configured; otherwise a self-hosted Ollama endpoint is used.
 */
function createAiProvider(env: Env, logger: Logger): LlmProvider & EmbeddingProvider {
  if (env.HF_TOKEN) {
    return new HuggingFaceProvider({
      token: env.HF_TOKEN,
      chatModel: env.HF_CHAT_MODEL ?? 'Qwen/Qwen2.5-7B-Instruct',
      embedModel: env.HF_EMBED_MODEL ?? 'BAAI/bge-small-en-v1.5',
      logger,
    });
  }
  if (env.OLLAMA_URL) {
    return new OllamaProvider({
      baseUrl: env.OLLAMA_URL,
      model: env.OLLAMA_MODEL ?? 'qwen2.5:7b',
      embedModel: env.OLLAMA_EMBED_MODEL ?? 'bge-small-en-v1.5',
      logger,
    });
  }
  throw new AppError('CONFIG_ERROR', 'No AI provider configured (set HF_TOKEN or OLLAMA_URL)', 500);
}
