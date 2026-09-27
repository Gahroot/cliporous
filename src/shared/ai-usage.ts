export interface TokenUsageEvent {
  source: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  timestamp: number;
}

export interface TokenUsageAggregate {
  promptTokens: number;
  completionTokens: number;
  calls: number;
  /** Sum of known model prices. Unknown-model calls are excluded, never guessed. */
  estimatedCostUsd: number;
  unpricedCalls: number;
}

export interface ModelPricing {
  modelId: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

/**
 * Pricing ledger for the Gemini Developer API paid tier.
 *
 * Versioning this data makes every displayed estimate traceable and keeps model
 * fallbacks from being silently charged at another model's rate. Update the
 * checked date, version, and focused tests together when Google changes prices.
 */
export const AI_PRICING = {
  version: 'google-gemini-api-2026-09-27',
  checkedDate: '27 September 2026',
  sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  currency: 'USD',
  models: {
    // 3.8 / 3.7 Flash: introductory price through 31 Dec 2026 ($1.50 / $7.50 from 1 Jan 2027).
    'gemini-3.8-flash': {
      modelId: 'gemini-3.8-flash',
      inputUsdPerMillionTokens: 0.75,
      outputUsdPerMillionTokens: 3.75,
    },
    'gemini-3.7-flash': {
      modelId: 'gemini-3.7-flash',
      inputUsdPerMillionTokens: 0.75,
      outputUsdPerMillionTokens: 3.75,
    },
    'gemini-3.5-flash-lite': {
      modelId: 'gemini-3.5-flash-lite',
      inputUsdPerMillionTokens: 0.3,
      outputUsdPerMillionTokens: 2.5,
    },
    // Legacy ids kept so historical usage records still price correctly.
    'gemini-3-flash-preview': {
      modelId: 'gemini-3-flash-preview',
      inputUsdPerMillionTokens: 0.5,
      outputUsdPerMillionTokens: 3,
    },
    'gemini-2.5-flash': {
      modelId: 'gemini-2.5-flash',
      inputUsdPerMillionTokens: 0.3,
      outputUsdPerMillionTokens: 2.5,
    },
    'gemini-2.5-flash-lite': {
      modelId: 'gemini-2.5-flash-lite',
      inputUsdPerMillionTokens: 0.1,
      outputUsdPerMillionTokens: 0.4,
    },
  } satisfies Record<string, ModelPricing>,
} as const;

export type PricedModelId = keyof typeof AI_PRICING.models;

export interface TokenCostEstimate {
  modelId: string;
  estimatedCostUsd: number | null;
  pricing: ModelPricing | null;
}

export function estimateTokenUsageCost(event: TokenUsageEvent): TokenCostEstimate {
  const pricing = (AI_PRICING.models as Record<string, ModelPricing>)[event.model] ?? null;
  if (!pricing) {
    return { modelId: event.model, estimatedCostUsd: null, pricing: null };
  }

  return {
    modelId: event.model,
    estimatedCostUsd:
      (event.promptTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
      (event.completionTokens / 1_000_000) * pricing.outputUsdPerMillionTokens,
    pricing,
  };
}

export function createTokenUsageAggregate(): TokenUsageAggregate {
  return {
    promptTokens: 0,
    completionTokens: 0,
    calls: 0,
    estimatedCostUsd: 0,
    unpricedCalls: 0,
  };
}
