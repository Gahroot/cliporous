/**
 * AI Token Usage Reporter
 *
 * Central module for emitting Gemini API token usage events to the renderer.
 * Each AI module calls `reportTokenUsage()` after a successful API call.
 * The reporter forwards usage to the renderer via `ai:tokenUsage` IPC events.
 */

import type { WebContents } from 'electron'
import { Ch } from '@shared/ipc-channels'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUsageEvent {
  source: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Module-level emitter registry
// ---------------------------------------------------------------------------

/** Active renderer WebContents to emit usage events to. */
let _webContents: WebContents | null = null

/**
 * Register the renderer WebContents so usage events can be forwarded.
 * Called once from index.ts after the window is created.
 */
export function setUsageWebContents(wc: WebContents): void {
  _webContents = wc
}

/**
 * Report token usage after a successful Gemini API call.
 * Safe to call when no renderer is registered — silently no-ops.
 */
export function reportTokenUsage(event: TokenUsageEvent): void {
  if (!_webContents || _webContents.isDestroyed()) return
  try {
    _webContents.send(Ch.Send.AI_TOKEN_USAGE, event)
  } catch {
    // Renderer may have been destroyed; ignore
  }
}

/**
 * Extract token counts from a Gemini API response's usageMetadata,
 * then emit via reportTokenUsage.
 */
export function emitUsageFromResponse(
  source: string,
  model: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }
): void {
  const promptTokens = response.usageMetadata?.promptTokenCount ?? 0
  const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0
  const totalTokens = response.usageMetadata?.totalTokenCount ?? (promptTokens + completionTokens)

  if (promptTokens === 0 && completionTokens === 0) return

  reportTokenUsage({
    source,
    promptTokens,
    completionTokens,
    totalTokens,
    model,
    timestamp: Date.now()
  })
}
