import { upstreamError, type Logger } from '@sqlcopilot/shared';
import type { EmbeddingProvider, GenerateOptions, LlmProvider } from './providers';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  embedModel: string;
  /** BGE-small produces 384-dimension vectors. */
  embedDimensions?: number;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: Logger;
}

interface OllamaGenerateResponse {
  response: string;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

/**
 * Client for a self-hosted Ollama instance (e.g. Oracle Cloud VM).
 * Implements both the LLM and embedding contracts.
 */
export class OllamaProvider implements LlmProvider, EmbeddingProvider {
  readonly dimensions: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly config: OllamaConfig) {
    this.dimensions = config.embedDimensions ?? 384;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 2;
  }

  async generate(options: GenerateOptions): Promise<string> {
    const body = {
      model: this.config.model,
      prompt: options.prompt,
      system: options.system,
      stream: false,
      options: {
        temperature: options.temperature ?? 0,
        num_predict: options.maxTokens ?? 1024,
      },
    };
    const data = await this.request<OllamaGenerateResponse>('/api/generate', body);
    return data.response;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const data = await this.request<OllamaEmbedResponse>('/api/embed', {
      model: this.config.embedModel,
      input: texts,
    });
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
      throw upstreamError('Ollama returned a malformed embeddings response');
    }
    return data.embeddings;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          const text = await response.text();
          throw upstreamError(`Ollama ${path} failed (${response.status}): ${text.slice(0, 300)}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        this.config.logger?.warn('ollama request failed', {
          path,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : upstreamError('Ollama request failed');
  }
}
