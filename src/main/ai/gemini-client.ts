import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { emitUsageFromResponse } from '../ai-usage'
import { log } from '../logger'

export interface GeminiCall {
  /** Primary model id. */
  model: string
  /**
   * Optional fallback model ids tried in order after the primary exhausts its
   * retries on a transient failure (503/UNAVAILABLE, 429, network). Each
   * fallback gets its own retry budget. Non-transient errors (e.g. 4xx auth)
   * skip fallbacks and throw immediately.
   */
  fallbacks?: readonly string[]
  config?: GenerateContentConfig
}

/**
 * Curated free-tier-eligible model chains (verified May 2026 against
 * ai.google.dev/gemini-api/docs/pricing). Order = preference, head first.
 *
 *   FAST     — short prompts, JSON extraction, classification.
 *   BALANCED — heavier reasoning (edit plans, hook generation, scoring).
 *
 * `gemini-3-flash-preview` is the new default workhorse; 2.5 models stay in
 * the chain as fallbacks because 3.x is preview and occasionally overloaded.
 */
export const MODELS = {
  FAST: ['gemini-3-flash-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const,
  BALANCED: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const
} as const

/**
 * Map a raw Gemini API error to a user-facing message and rethrow.
 * Always throws — the `never` return makes it usable as a terminal in
 * control-flow branches without additional `throw` statements.
 */
export function classifyGeminiError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number })?.status

  if (status === 401 || status === 403 || /api.key/i.test(msg)) {
    throw new Error('Invalid Gemini API key. Check your key in Settings.')
  }
  if (status === 429 || /resource.exhausted|rate.limit|quota/i.test(msg)) {
    throw new Error('Gemini API rate limit exceeded. Please wait and try again.')
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) {
    throw new Error('Network error: cannot reach Gemini API. Check your internet connection.')
  }
  throw err instanceof Error ? err : new Error(msg)
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number })?.status
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /resource.exhausted|rate.limit|quota/i.test(msg) ||
    /UNAVAILABLE|overloaded|high demand|deadline.expired|internal error/i.test(msg) ||
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)
  )
}

/** Sleep with ±25% jitter to spread out concurrent retries. */
function backoff(attemptIndex: number): Promise<void> {
  // 0 -> ~2s, 1 -> ~5s, 2 -> ~12s
  const base = [2000, 5000, 12000][attemptIndex] ?? 12000
  const jitter = base * 0.25 * (Math.random() * 2 - 1)
  return new Promise((r) => setTimeout(r, Math.max(500, base + jitter)))
}

/**
 * Call Gemini with retries and optional model fallbacks.
 *
 * Per model: up to 3 attempts with exponential backoff + jitter on transient
 * errors (429/5xx/UNAVAILABLE/overloaded/network). After exhausting retries
 * on one model, falls through to `call.fallbacks` in order. Non-transient
 * errors (auth, bad request) throw immediately without using fallbacks.
 *
 * Emits token usage via the ai-usage module after each successful call.
 */
export async function callGeminiWithRetry(
  ai: GoogleGenAI,
  call: GeminiCall,
  prompt: string,
  usageSource: string
): Promise<string> {
  const chain = [call.model, ...(call.fallbacks ?? [])]
  const maxAttemptsPerModel = 3
  let lastErr: unknown

  for (let m = 0; m < chain.length; m++) {
    const model = chain[m]!
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: prompt,
          config: call.config
        })
        emitUsageFromResponse(usageSource, model, result)
        if (m > 0 || attempt > 0) {
          log(
            'info',
            'gemini',
            `${usageSource}: succeeded on ${model} (model ${m + 1}/${chain.length}, attempt ${attempt + 1}/${maxAttemptsPerModel})`
          )
        }
        return (result.text ?? '').trim()
      } catch (err) {
        lastErr = err
        if (!isTransientError(err)) classifyGeminiError(err)

        const isLastAttemptOnModel = attempt === maxAttemptsPerModel - 1
        const hasFallback = m < chain.length - 1
        const status = (err as { status?: number })?.status
        log(
          'warn',
          'gemini',
          `${usageSource}: transient error on ${model} (status ${status ?? 'n/a'}, attempt ${attempt + 1}/${maxAttemptsPerModel}): ${err instanceof Error ? err.message : String(err)}`
        )

        if (isLastAttemptOnModel) {
          if (hasFallback) break // fall through to next model
          classifyGeminiError(err)
        } else {
          await backoff(attempt)
        }
      }
    }
  }

  // Unreachable: every exit path above either returns or throws via
  // classifyGeminiError. Kept for type-narrowing.
  classifyGeminiError(lastErr)
}
