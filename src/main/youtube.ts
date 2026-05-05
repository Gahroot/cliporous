import { tmpdir } from 'os'
import { join } from 'path'
import { runPythonScript } from './python'
import { YOUTUBE_DOWNLOAD_TIMEOUT_MS } from '@shared/constants'

// ---------------------------------------------------------------------------
// URL utilities
// ---------------------------------------------------------------------------

const YT_PATTERNS = [
  /(?:youtube\.com\/(?:.*v=|v\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/v\/([A-Za-z0-9_-]{11})/i,
  /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  /m\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i
]

/**
 * Extract the 11-character video ID from a YouTube URL, or return null.
 */
export function getYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  for (const pattern of YT_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match && match[1].length === 11) return match[1]
  }
  // Fallback: query param
  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v')
      if (v && v.length === 11) return v
    }
  } catch {
    // not a valid URL
  }
  return null
}

// ---------------------------------------------------------------------------
// Download result types
// ---------------------------------------------------------------------------

export interface YouTubeDownloadResult {
  path: string
  title: string
  duration: number
}

type ProgressLine = { type: 'progress'; percent: number; speed: string; eta: string }
type DoneLine = { type: 'done'; path: string; title: string; duration: number }
type ErrorLine = { type: 'error'; message: string }
type ParsedLine = ProgressLine | DoneLine | ErrorLine

function parseLine(raw: string): ParsedLine | null {
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj.type === 'string') return obj as ParsedLine
  } catch {
    // not JSON — ignore
  }
  return null
}

// ---------------------------------------------------------------------------
// Download function
// ---------------------------------------------------------------------------

/**
 * Download a YouTube video using the bundled yt-dlp Python script.
 *
 * @param url        YouTube video URL
 * @param outputDir  Directory to save the downloaded file (defaults to OS temp dir)
 * @param onProgress Called with download percentage (0–100) as it progresses
 * @returns          Resolved path, title, and duration of the downloaded video
 */
export async function downloadYouTube(
  url: string,
  outputDir: string = join(tmpdir(), 'batchcontent-yt'),
  onProgress: (percent: number) => void = () => {}
): Promise<YouTubeDownloadResult> {
  if (!getYouTubeVideoId(url)) {
    throw new Error('Invalid YouTube URL. Please provide a valid YouTube video link.')
  }

  let result: YouTubeDownloadResult | null = null
  let errorMessage: string | null = null

  await runPythonScript('download.py', ['--url', url, '--output-dir', outputDir], {
    // Downloads can take a long time — allow up to 2 hours
    timeoutMs: 2 * 60 * 60 * 1000,
    onStdout: (line) => {
      const parsed = parseLine(line)
      if (!parsed) return

      if (parsed.type === 'progress') {
        onProgress(parsed.percent)
      } else if (parsed.type === 'done') {
        result = { path: parsed.path, title: parsed.title, duration: parsed.duration }
      } else if (parsed.type === 'error') {
        errorMessage = parsed.message
      }
    }
  })

  if (errorMessage) {
    // Strip ANSI escape codes and truncate long error messages
    const cleaned = (errorMessage as string).replace(/\x1b\[[0-9;]*m/g, '').trim()
    const truncated = cleaned.length > 500 ? cleaned.slice(0, 500) + '…' : cleaned
    throw new Error(`YouTube download failed: ${truncated}`)
  }

  if (!result) {
    throw new Error('YouTube download completed but no result was received')
  }

  return result
}
