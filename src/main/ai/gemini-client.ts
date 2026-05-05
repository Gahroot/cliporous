import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { emitUsageFromResponse } from '../ai-usage'

export interface GeminiCall {
  model: string
  config?: GenerateContentConfig
}

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
    /resource.exhausted|rate.limit|quota/i.test(msg) ||
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)
  )
}

/**
 * Call Gemini with a single retry on transient errors (429, network).
 * Emits token usage via the ai-usage module after each successful call.
 *
 * On non-transient error — or if both attempts fail — `classifyGeminiError`
 * is called, which always throws.
 */
export async function callGeminiWithRetry(
  ai: GoogleGenAI,
  call: GeminiCall,
  prompt: string,
  usageSource: string
): Promise<string> {
  const run = async (): Promise<string> => {
    const result = await ai.models.generateContent({
      model: call.model,
      contents: prompt,
      config: call.config
    })
    emitUsageFromResponse(usageSource, call.model, result)
    return (result.text ?? '').trim()
  }

  try {
    return await run()
  } catch (err) {
    if (!isTransientError(err)) classifyGeminiError(err)
    await new Promise((r) => setTimeout(r, 2000))
    try {
      return await run()
    } catch (retryErr) {
      classifyGeminiError(retryErr)
    }
  }
}
