import { join } from 'path'
import { tmpdir } from 'os'
import { unlink, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { extractAudio } from './ffmpeg'
import { runPythonScript, resolvePythonPath, resolveScriptPath } from './python'

// ---------------------------------------------------------------------------
// Types (canonical definitions live in @shared/types)
// ---------------------------------------------------------------------------

import type { WordTimestamp, SegmentTimestamp, TranscriptionResult } from '@shared/types'
export type { WordTimestamp, SegmentTimestamp, TranscriptionResult }

/** Transcription timeout: 3 hours. */
const TRANSCRIPTION_TIMEOUT_MS = 3 * 60 * 60 * 1000

export interface TranscriptionProgress {
  stage: 'extracting-audio' | 'downloading-model' | 'loading-model' | 'transcribing'
  message: string
  /** 0–100, present during downloading-model stage */
  percent?: number
}

// ---------------------------------------------------------------------------
// Python stdout line types
// ---------------------------------------------------------------------------

interface ProgressLine {
  type: 'progress'
  stage: string
  message: string
}

interface DoneLine {
  type: 'done'
  text: string
  words: WordTimestamp[]
  segments: SegmentTimestamp[]
}

interface ErrorLine {
  type: 'error'
  message: string
}

type PythonLine = ProgressLine | DoneLine | ErrorLine

// ---------------------------------------------------------------------------
// transcribeVideo
// ---------------------------------------------------------------------------

/**
 * Full pipeline: extract audio → run Parakeet TDT v3 → return word timestamps.
 *
 * @param videoPath   Absolute path to the source video file
 * @param onProgress  Called for each pipeline stage transition
 * @param model       NeMo model name (default: nvidia/parakeet-tdt-0.6b-v3)
 */
export async function transcribeVideo(
  videoPath: string,
  onProgress: (p: TranscriptionProgress) => void,
  model = 'nvidia/parakeet-tdt-0.6b-v3'
): Promise<TranscriptionResult> {
  // --- Pre-flight: verify Python environment ---
  const pythonBin = resolvePythonPath()
  const scriptPath = resolveScriptPath('transcribe.py')
  const pythonExists = existsSync(pythonBin)
  const scriptExists = existsSync(scriptPath)

  console.log(`[Transcribe] Python binary: ${pythonBin} (exists: ${pythonExists})`)
  console.log(`[Transcribe] Script path: ${scriptPath} (exists: ${scriptExists})`)

  if (!pythonExists && pythonBin !== 'python3' && pythonBin !== 'python') {
    throw new Error(
      `Python environment not found. The Python binary does not exist at: ${pythonBin}\n\n` +
      'Please go to Settings and run "Setup Python Environment" first.'
    )
  }

  if (!scriptExists) {
    throw new Error(
      `Transcription script not found at: ${scriptPath}\n\n` +
      'The Python scripts may not have been bundled correctly with the application.'
    )
  }

  const ts = Date.now()
  const wavPath = join(tmpdir(), `batchcontent-transcribe-${ts}.wav`)
  const jsonPath = join(tmpdir(), `batchcontent-transcribe-${ts}.json`)

  // --- Step 1: extract audio ---
  onProgress({ stage: 'extracting-audio', message: 'Extracting audio from video...' })
  try {
    await extractAudio(videoPath, wavPath)
  } catch (err) {
    throw new Error(`Audio extraction failed: ${(err as Error).message}`)
  }

  // --- Step 2 & 3: load model + transcribe ---
  let result: TranscriptionResult | null = null
  let scriptError: string | null = null
  // Tail of recent stdout/stderr captured for diagnostics if no result is produced.
  const recentStdout: string[] = []
  const recentStderr: string[] = []
  const TAIL_LIMIT = 40

  try {
    try {
      await runPythonScript(
        'transcribe.py',
        ['--input', wavPath, '--output', jsonPath, '--model', model],
        {
          timeoutMs: TRANSCRIPTION_TIMEOUT_MS,
          onStderr: (line) => {
            recentStderr.push(line)
            if (recentStderr.length > TAIL_LIMIT) recentStderr.shift()
          },
          onStdout: (line) => {
            recentStdout.push(line)
            if (recentStdout.length > TAIL_LIMIT) recentStdout.shift()

            let parsed: PythonLine
            try {
              parsed = JSON.parse(line) as PythonLine
            } catch {
              // Not a JSON line — ignore (e.g. Python warnings, NeMo logs,
              // tqdm progress smushed against a JSON message via \r).
              return
            }

            if (parsed.type === 'progress') {
              const stage = parsed.stage as TranscriptionProgress['stage']
              if (stage === 'downloading-model' || stage === 'loading-model' || stage === 'transcribing') {
                const progress: TranscriptionProgress = { stage, message: parsed.message }
                // Pass percent for downloading-model if present
                if ('percent' in parsed && typeof (parsed as { percent?: number }).percent === 'number') {
                  progress.percent = (parsed as { percent: number }).percent
                }
                onProgress(progress)
              }
            } else if (parsed.type === 'done') {
              result = {
                text: parsed.text,
                words: parsed.words,
                segments: parsed.segments,
              }
            } else if (parsed.type === 'error') {
              scriptError = parsed.message
            }
          }
        }
      )
    } catch (runErr) {
      // runPythonScript rejects on non-zero exit code with a generic stderr-only
      // message.  If the script emitted a JSON error on stdout (captured via
      // onStdout → scriptError), that message is far more useful — prefer it.
      if (scriptError) {
        throw new Error(`Transcription script error: ${scriptError}`)
      }
      throw runErr
    }

    // --- Fallback: if the `done` JSON line wasn't captured from stdout (e.g.
    // NeMo log output or tqdm \r output got concatenated against it and broke
    // JSON.parse), read the result file the script always writes to disk. This
    // makes us tolerant of any future stdout pollution from NeMo/PyTorch.
    if (!result && !scriptError && existsSync(jsonPath)) {
      try {
        const raw = await readFile(jsonPath, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<TranscriptionResult> & { error?: string }
        if (parsed.error) {
          scriptError = parsed.error
        } else if (typeof parsed.text === 'string' && Array.isArray(parsed.words) && Array.isArray(parsed.segments)) {
          console.warn('[Transcribe] stdout `done` line was lost — recovered result from output JSON file')
          result = {
            text: parsed.text,
            words: parsed.words as TranscriptionResult['words'],
            segments: parsed.segments as TranscriptionResult['segments'],
          }
        }
      } catch (err) {
        console.warn('[Transcribe] Failed to read output JSON fallback:', (err as Error).message)
      }
    }
  } finally {
    // Clean up WAV temp file regardless of success/failure
    unlink(wavPath).catch(() => {/* ignore */})
    unlink(jsonPath).catch(() => {/* ignore */})
  }

  if (scriptError) {
    throw new Error(`Transcription script error: ${scriptError}`)
  }

  if (!result) {
    // Surface the recent stderr/stdout tail so the user sees what NeMo actually
    // printed instead of a vague "no result". Capped to keep the message
    // dialog reasonable.
    const stderrTail = recentStderr.slice(-15).join('\n')
    const stdoutTail = recentStdout.slice(-10).map((l) => l.slice(0, 200)).join('\n')
    throw new Error(
      'Transcription script completed but produced no result.\n' +
      `Output JSON: ${jsonPath} (exists: ${existsSync(jsonPath)})\n` +
      (stderrTail ? `\n--- last stderr ---\n${stderrTail}` : '') +
      (stdoutTail ? `\n--- last stdout ---\n${stdoutTail}` : '')
    )
  }

  return result
}

// ---------------------------------------------------------------------------
// formatTranscriptForAI
// ---------------------------------------------------------------------------

/**
 * Format a TranscriptionResult into a timestamped transcript string suitable
 * for passing to an AI model for clip scoring.
 *
 * Groups words into segments of ~8 words each, with timestamps in MM:SS format.
 * Example output line: [00:25 - 00:35] This is the segment text here
 */
export function formatTranscriptForAI(result: TranscriptionResult): string {
  if (!result.words || result.words.length === 0) {
    return result.text || ''
  }

  const MAX_WORDS_PER_SEGMENT = 8
  const lines: string[] = []

  let currentWords: string[] = []
  let segmentStart: number | null = null
  let segmentEnd = 0

  for (const word of result.words) {
    if (segmentStart === null) {
      segmentStart = word.start
    }

    currentWords.push(word.text)
    segmentEnd = word.end

    const isBreak =
      currentWords.length >= MAX_WORDS_PER_SEGMENT ||
      word.text.endsWith('.') ||
      word.text.endsWith('!') ||
      word.text.endsWith('?')

    if (isBreak) {
      lines.push(
        `[${formatSec(segmentStart)} - ${formatSec(segmentEnd)}] ${currentWords.join(' ')}`
      )
      currentWords = []
      segmentStart = null
    }
  }

  // Flush any remaining words
  if (currentWords.length > 0 && segmentStart !== null) {
    lines.push(
      `[${formatSec(segmentStart)} - ${formatSec(segmentEnd)}] ${currentWords.join(' ')}`
    )
  }

  return lines.join('\n')
}

/** Format seconds to MM:SS */
function formatSec(sec: number): string {
  const s = Math.round(sec)
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}
