/**
 * Provider interfaces keep the rest of the system model-agnostic: swapping
 * Ollama for a hosted API, or BGE for another embedding model, only requires
 * a new implementation of these two contracts.
 */

export interface GenerateOptions {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmProvider {
  generate(options: GenerateOptions): Promise<string>;
}

export interface EmbeddingProvider {
  /** Returns one vector per input text, in order. */
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}
