import { GoogleGenAI } from '@google/genai';
import { callGeminiWithRetry, MODELS } from '../gemini-client';

export type PlannerPhase = 'outline' | 'draft' | 'review';
export interface PlannerGenerationRequest {
  phase: PlannerPhase;
  prompt: string;
  expectation: 'json-object';
  signal?: AbortSignal;
}
export interface GenerationMetadata {
  provider: 'gemini' | 'codex-subscription' | 'offline';
  model: string;
  configId: string;
  latencyMs: number;
  cliVersion?: string;
  /** GG transport is not a Codex CLI build; record its separate client identity. */
  transport?: 'gg-chatgpt';
  clientVersion?: string;
  authMode?: 'chatgpt';
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}
/** Completion text is UNTRUSTED. Only the existing admission parser creates scenes. */
export type PlannerGenerator = (request: PlannerGenerationRequest) => Promise<{
  text: string;
  metadata: GenerationMetadata;
}>;
export const MAX_COMPLETION_BYTES = 512 * 1024;

/** Created only on the production default path, never for an injected evaluation transport. */
export function createGeminiPlannerGenerator(apiKey: string): PlannerGenerator {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ prompt, phase, signal }) => {
    signal?.throwIfAborted();
    const started = Date.now();
    const text = await callGeminiWithRetry(
      ai,
      {
        model: MODELS.BALANCED[0],
        fallbacks: MODELS.BALANCED.slice(1),
        config: { responseMimeType: 'application/json' },
        thinking: 'high',
      },
      prompt,
      phase === 'draft' ? 'explainer-scenes' : `explainer-${phase}`,
      signal,
    );
    signal?.throwIfAborted();
    return {
      text,
      metadata: {
        provider: 'gemini',
        model: 'unreported-by-production-wrapper',
        configId: 'production-gemini-v1',
        latencyMs: Date.now() - started,
      },
    };
  };
}

export async function generatePlannerJson(
  generator: PlannerGenerator,
  request: PlannerGenerationRequest,
  observe?: (metadata: GenerationMetadata, phase: PlannerPhase) => void,
): Promise<unknown> {
  request.signal?.throwIfAborted();
  const completion = await generator(request);
  request.signal?.throwIfAborted();
  observe?.(completion.metadata, request.phase);
  if (
    typeof completion.text !== 'string' ||
    Buffer.byteLength(completion.text) > MAX_COMPLETION_BYTES
  )
    return null;
  try {
    return JSON.parse(completion.text);
  } catch {
    return null;
  }
}
