import { upstreamError, type Logger } from '@sqlcopilot/shared';
import type { EmbeddingProvider, GenerateOptions, LlmProvider } from './providers';

export interface HuggingFaceConfig {
  token: string;
  /** Chat model id on the HF router, e.g. "Qwen/Qwen2.5-7B-Instruct". */
  chatModel: string;
  /** Feature-extraction model id, e.g. "BAAI/bge-small-en-v1.5". */
  embedModel: string;
  /** bge-small-en-v1.5 produces 384-dimension vectors. */
  embedDimensions?: number;
  /** Defaults to the HuggingFace inference router. */
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: Logger;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: string | { message?: string };
}

/**
 * HuggingFace Inference Providers implementation of the LLM + embedding
 * contracts. Chat uses the OpenAI-compatible router; embeddings use the
 * hf-inference feature-extraction pipeline. Chosen over a self-hosted model so
 * the Worker needs no VM or tunnel — only an API token.
 */
export class HuggingFaceProvider implements LlmProvider, EmbeddingProvider {
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly config: HuggingFaceConfig) {
    this.dimensions = config.embedDimensions ?? 384;
    this.baseUrl = (config.baseUrl ?? 'https://router.huggingface.co').replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async generate(options: GenerateOptions): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (options.system) messages.push({ role: 'system', content: options.system });
    messages.push({ role: 'user', content: options.prompt });

    const data = await this.request<ChatCompletionResponse>('/v1/chat/completions', {
      model: this.config.chatModel,
      messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 1024,
      stream: false,
    });

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw upstreamError('HuggingFace chat completion returned no content');
    }
    return content;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const path = `/hf-inference/models/${this.config.embedModel}/pipeline/feature-extraction`;
    const data = await this.request<unknown>(path, { inputs: texts });
    return this.normalizeEmbeddings(data, texts.length);
  }

  /**
   * The pipeline returns a flat vector for a single input and an array of
   * vectors for a batch. Normalize both to number[][] and validate shape.
   */
  private normalizeEmbeddings(data: unknown, expected: number): number[][] {
    if (!Array.isArray(data)) throw upstreamError('HuggingFace embeddings response was not an array');
    const nested: number[][] =
      typeof data[0] === 'number' ? [data as number[]] : (data as number[][]);
    if (nested.length !== expected) {
      throw upstreamError(`HuggingFace returned ${nested.length} embeddings for ${expected} inputs`);
    }
    for (const vector of nested) {
      if (!Array.isArray(vector) || vector.length !== this.dimensions) {
        throw upstreamError(
          `HuggingFace embedding dimension mismatch: expected ${this.dimensions}, got ${vector?.length}`,
        );
      }
    }
    return nested;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) return (await response.json()) as T;

        const text = await response.text();
        // 503 = model cold-loading, 429 = rate limited: both are retryable.
        const retryable = response.status === 503 || response.status === 429;
        this.config.logger?.warn('huggingface request failed', {
          path,
          status: response.status,
          attempt,
          retryable,
          body: text.slice(0, 200),
        });
        if (retryable && attempt < this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw upstreamError(`HuggingFace ${path} failed (${response.status}): ${text.slice(0, 200)}`);
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : upstreamError('HuggingFace request failed');
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
  }
}
