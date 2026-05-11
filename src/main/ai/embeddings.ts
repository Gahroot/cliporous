import { GoogleGenAI } from '@google/genai'
import { classifyGeminiError } from './gemini-client'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = 'gemini-embedding-001'
const OUTPUT_DIMENSIONALITY = 768
const REQUEST_TIMEOUT_MS = 30_000
const RETRY_BACKOFF_MS = 2_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Normalize a vector to unit length (L2 norm). Returns a fresh `Float32Array`.
 *
 * If the input vector has zero magnitude (all zeros), the original values are
 * returned as a `Float32Array` unchanged — dividing by zero would produce NaNs.
 */
export function normalizeVector(v: number[] | Float32Array): Float32Array {
  const out = new Float32Array(v.length)
  let sumSq = 0
  for (let i = 0; i < v.length; i++) {
    const x = v[i]
    sumSq += x * x
  }
  const norm = Math.sqrt(sumSq)
  if (norm === 0 || !Number.isFinite(norm)) {
    for (let i = 0; i < v.length; i++) out[i] = v[i]
    return out
  }
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

// ---------------------------------------------------------------------------
// Core embedding call
// ---------------------------------------------------------------------------

async function embedOnce(
  ai: GoogleGenAI,
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<number[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        taskType,
        outputDimensionality: OUTPUT_DIMENSIONALITY,
        abortSignal: controller.signal
      }
    })
    const values = response.embeddings?.[0]?.values
    if (!values || values.length === 0) {
      throw new Error('Gemini embedding response contained no values.')
    }
    if (values.length !== OUTPUT_DIMENSIONALITY) {
      throw new Error(
        `Gemini embedding returned ${values.length} dimensions, expected ${OUTPUT_DIMENSIONALITY}.`
      )
    }
    return values
  } finally {
    clearTimeout(timer)
  }
}

async function embedWithRetry(
  text: string,
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<Float32Array> {
  if (!apiKey) {
    throw new Error('Gemini API key is required for embeddings. Configure it in Settings.')
  }
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot embed empty text.')
  }

  const ai = new GoogleGenAI({ apiKey })

  let values: number[]
  try {
    values = await embedOnce(ai, text, taskType)
  } catch (err) {
    if (!isTransientError(err)) classifyGeminiError(err)
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
    try {
      values = await embedOnce(ai, text, taskType)
    } catch (retryErr) {
      classifyGeminiError(retryErr)
    }
  }

  return normalizeVector(values)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Embed text for storage (corpus side) using `RETRIEVAL_DOCUMENT` task type.
 * Returns a unit-normalized 768-dim `Float32Array`.
 *
 * Throws on missing API key, empty text, or API failure — callers should catch
 * and fall back to exact-match-only search.
 */
export async function embedForStorage(text: string, apiKey: string): Promise<Float32Array> {
  return embedWithRetry(text, apiKey, 'RETRIEVAL_DOCUMENT')
}

/**
 * Embed text for query side using `RETRIEVAL_QUERY` task type.
 * Returns a unit-normalized 768-dim `Float32Array`.
 *
 * Throws on missing API key, empty text, or API failure — callers should catch
 * and fall back to exact-match-only search.
 */
export async function embedForQuery(text: string, apiKey: string): Promise<Float32Array> {
  return embedWithRetry(text, apiKey, 'RETRIEVAL_QUERY')
}
