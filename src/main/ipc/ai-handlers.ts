import { ipcMain } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'
import { GoogleGenAI } from '@google/genai'
import { scoreTranscript, generateHookText, rescoreSingleClip } from '../ai-scoring'
import type { TargetDuration } from '../ai-scoring'
import { generateRehookText } from '../overlays/rehook'
import type { TranscriptionResult } from '../transcription'
import {
  detectCuriosityGaps,
  optimizeClipBoundaries,
  optimizeClipEndpoints,
  rankClipsByCuriosity
} from '../ai/curiosity-gap'
import type { CuriosityGap, ClipCandidate, ClipEndMode } from '../ai/curiosity-gap'
import {
  generateClipDescription,
  generateBatchDescriptions
} from '../ai/description-generator'
import type { DescriptionClipInput } from '../ai/description-generator'
import { analyzeWordEmphasis } from '../word-emphasis'
import type { WordTimestamp } from '@shared/types'
import { generateSegmentImage } from '../fal-image'
import type { FalAspectRatio } from '../fal-image'

const AI_VALIDATION_MODEL = 'gemini-2.5-flash-lite'

export function registerAiHandlers(): void {
  // AI — score transcript segments for viral potential
  ipcMain.handle(
    Ch.Invoke.AI_SCORE_TRANSCRIPT,
    wrapHandler(
      Ch.Invoke.AI_SCORE_TRANSCRIPT,
      async (
        event,
        apiKey: string,
        formattedTranscript: string,
        videoDuration: number,
        targetDuration?: string,
        targetAudience?: string
      ) => {
        return scoreTranscript(
          apiKey,
          formattedTranscript,
          videoDuration,
          (progress) => {
            event.sender.send(Ch.Send.AI_SCORING_PROGRESS, progress)
          },
          (targetDuration as TargetDuration) || 'auto',
          targetAudience || ''
        )
      }
    )
  )

  // AI — generate hook text for a clip
  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_HOOK_TEXT,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_HOOK_TEXT,
      async (_event, apiKey: string, transcript: string, videoSummary?: string, keyTopics?: string[]) => {
        return generateHookText(apiKey, transcript, videoSummary, keyTopics)
      }
    )
  )

  // AI — generate re-hook / pattern interrupt text
  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_REHOOK_TEXT,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_REHOOK_TEXT,
      async (
        _event,
        apiKey: string,
        transcript: string,
        clipStart: number,
        clipEnd: number,
        videoSummary?: string,
        keyTopics?: string[]
      ) => {
        return generateRehookText(apiKey, transcript, clipStart, clipEnd, videoSummary, keyTopics)
      }
    )
  )

  // AI — re-score a single clip after user edits its boundaries
  ipcMain.handle(
    Ch.Invoke.AI_RESCORE_SINGLE_CLIP,
    wrapHandler(
      Ch.Invoke.AI_RESCORE_SINGLE_CLIP,
      async (_event, apiKey: string, clipText: string, clipDuration: number) => {
        return rescoreSingleClip(apiKey, clipText, clipDuration)
      }
    )
  )

  // AI — validate a Gemini API key
  ipcMain.handle(
    Ch.Invoke.AI_VALIDATE_GEMINI_KEY,
    wrapHandler(
      Ch.Invoke.AI_VALIDATE_GEMINI_KEY,
      async (_event, apiKey: string): Promise<{ valid: boolean; error?: string; warning?: string }> => {
        if (!apiKey || !apiKey.trim()) {
          return { valid: false, error: 'API key is empty' }
        }
        try {
          const ai = new GoogleGenAI({ apiKey: apiKey.trim() })
          await ai.models.generateContent({
            model: AI_VALIDATION_MODEL,
            contents: 'Hi'
          })
          return { valid: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const status = (err as { status?: number })?.status
          if (status === 400 && /api.key|API_KEY/i.test(msg)) {
            return { valid: false, error: 'Invalid API key' }
          }
          if (status === 401 || status === 403 || /api.key|API_KEY/i.test(msg)) {
            return { valid: false, error: 'Invalid API key' }
          }
          if (status === 429 || /resource.exhausted|rate.limit|quota/i.test(msg)) {
            return {
              valid: true,
              warning: 'API key is valid but temporarily rate-limited. Usage may fail until quota resets.'
            }
          }
          if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) {
            return { valid: false, error: 'Network error — check your internet connection' }
          }
          return { valid: false, error: msg.slice(0, 120) }
        }
      }
    )
  )

  // AI — detect curiosity gaps in a transcript
  ipcMain.handle(
    Ch.Invoke.AI_DETECT_CURIOSITY_GAPS,
    wrapHandler(
      Ch.Invoke.AI_DETECT_CURIOSITY_GAPS,
      async (
        _event,
        apiKey: string,
        transcript: Parameters<typeof detectCuriosityGaps>[1],
        formattedTranscript: string,
        videoDuration: number
      ) => {
        return detectCuriosityGaps(apiKey, transcript, formattedTranscript, videoDuration)
      }
    )
  )

  // AI — optimize clip boundaries around a curiosity gap
  ipcMain.handle(
    Ch.Invoke.AI_OPTIMIZE_CLIP_BOUNDARIES,
    wrapHandler(
      Ch.Invoke.AI_OPTIMIZE_CLIP_BOUNDARIES,
      (
        _event,
        gap: CuriosityGap,
        originalStart: number,
        originalEnd: number,
        transcript: Parameters<typeof optimizeClipBoundaries>[3]
      ) => {
        return optimizeClipBoundaries(gap, originalStart, originalEnd, transcript)
      }
    )
  )

  // AI — optimize clip start/end points using a specific mode strategy
  ipcMain.handle(
    Ch.Invoke.AI_OPTIMIZE_CLIP_ENDPOINTS,
    wrapHandler(
      Ch.Invoke.AI_OPTIMIZE_CLIP_ENDPOINTS,
      (_e, mode: ClipEndMode, clipStart: number, clipEnd: number, transcript: TranscriptionResult, gap?: CuriosityGap) =>
        optimizeClipEndpoints(mode, clipStart, clipEnd, transcript, gap)
    )
  )

  // AI — re-rank clip candidates by blending virality + curiosity gap scores
  ipcMain.handle(
    Ch.Invoke.AI_RANK_CLIPS_BY_CURIOSITY,
    wrapHandler(
      Ch.Invoke.AI_RANK_CLIPS_BY_CURIOSITY,
      (_event, clips: ClipCandidate[], gaps: CuriosityGap[]) => {
        return rankClipsByCuriosity(clips, gaps)
      }
    )
  )

  // Description Generator — single clip
  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_CLIP_DESCRIPTION,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_CLIP_DESCRIPTION,
      async (_event, apiKey: string, transcript: string, clipContext?: string, hookTitle?: string) => {
        return generateClipDescription(apiKey, transcript, clipContext, hookTitle)
      }
    )
  )

  // Description Generator — batch
  ipcMain.handle(
    Ch.Invoke.AI_GENERATE_BATCH_DESCRIPTIONS,
    wrapHandler(
      Ch.Invoke.AI_GENERATE_BATCH_DESCRIPTIONS,
      async (_event, apiKey: string, clips: DescriptionClipInput[]) => {
        return generateBatchDescriptions(apiKey, clips)
      }
    )
  )

  // Word Emphasis — analyze transcript words for emphasis/supersize styling
  ipcMain.handle(
    Ch.Invoke.AI_ANALYZE_WORD_EMPHASIS,
    wrapHandler(
      Ch.Invoke.AI_ANALYZE_WORD_EMPHASIS,
      async (_event, words: WordTimestamp[], apiKey?: string) => {
        return analyzeWordEmphasis(words, apiKey)
      }
    )
  )

  // fal.ai — generate AI image for B-roll / segment layouts
  ipcMain.handle(
    Ch.Invoke.FAL_GENERATE_IMAGE,
    wrapHandler(
      Ch.Invoke.FAL_GENERATE_IMAGE,
      async (
        _event,
        { prompt, aspectRatio, apiKey }: { prompt: string; aspectRatio: FalAspectRatio; apiKey: string }
      ) => {
        return generateSegmentImage(prompt, aspectRatio, apiKey)
      }
    )
  )
}
