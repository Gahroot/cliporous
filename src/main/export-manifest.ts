import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import type { RenderClipJob, RenderBatchOptions } from './render/types'
import type { ClipDescription } from './ai/description-generator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManifestClipEntry {
  /** Clip identifier */
  id: string
  /** Output filename (mp4) */
  filename: string
  /** Viral potential score (0–100) */
  score: number
  /** Clip start time in source video (seconds) */
  startTime: number
  /** Clip end time in source video (seconds) */
  endTime: number
  /** Clip duration (seconds) */
  duration: number
  /** AI-generated hook text */
  hookText: string
  /**
   * Source video path used for this clip. Captured per-clip because stitched
   * clips may eventually mix sources, and viewers of the manifest shouldn't
   * have to cross-reference the batch-level `source` block.
   */
  sourceVideo: string
  /** Resolved accent color (hex, e.g. "#9F75FF") for highlights/emphasis. */
  accentColor?: string
  /** Captions render mode ("standard" | "emphasis" | "emphasis_highlight" | "disabled"). */
  captionsMode: string
  /**
   * Archetype used for this clip. For segmented/stitched clips the value is the
   * primary (first segment) archetype; for non-segmented clips it falls back to
   * the active style preset id.
   */
  archetype?: string
  /** AI reasoning for score */
  reasoning: string
  /** Render status */
  status: 'success' | 'failed'
  /** First 200 chars of transcript text */
  transcriptExcerpt: string
  /** Loop quality score (0–100), if loop optimization was run */
  loopScore?: number
  /** Render time in milliseconds */
  renderTimeMs?: number
  /** AI-generated platform descriptions + hashtags */
  description?: ClipDescription
  /** Social media suggestions */
  socialMedia: {
    captionText: string
    hashtags: string[]
    bestPostingTimes: {
      platform: string
      times: string[]
    }[]
  }
}

export interface RenderManifest {
  /** ISO 8601 timestamp of when the batch was generated */
  generatedAt: string
  /** App version tag */
  appVersion: string
  /** Source video information */
  source: {
    name: string
    path: string
    duration: number
  }
  /** Global render settings summary */
  settings: {
    encoder: string
    captionsEnabled: boolean
    autoZoomEnabled: boolean
    hookTitleEnabled: boolean
    rehookEnabled: boolean
  }
  /** Batch statistics */
  stats: {
    total: number
    completed: number
    failed: number
    totalRenderTimeMs: number
    avgRenderTimeMs: number
  }
  /** Per-clip entries */
  clips: ManifestClipEntry[]
}

// ---------------------------------------------------------------------------
// Extended job data provided by the IPC handler at render time
// ---------------------------------------------------------------------------

export interface ManifestJobMeta {
  clipId: string
  /** Clip score (0–100) from AI scoring */
  score: number
  /** Hook text */
  hookText: string
  /** AI reasoning */
  reasoning: string
  /** Transcript text for this clip */
  transcriptText: string
  /** Loop quality score if available */
  loopScore?: number
  /** AI description if available */
  description?: ClipDescription
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best posting times by platform — generic industry guidance */
const PLATFORM_POSTING_TIMES: Record<string, string[]> = {
  TikTok: ['6–10 AM', '7–9 PM'],
  'Instagram Reels': ['9–11 AM', '7–9 PM'],
  'YouTube Shorts': ['12–3 PM', '7–9 PM']
}

function buildSocialMediaSection(
  hookText: string,
  description?: ClipDescription
): ManifestClipEntry['socialMedia'] {
  // Build caption text: hook text + first platform description if available
  let captionText = hookText || ''
  if (description?.platforms?.length) {
    const tiktok = description.platforms.find((p) => p.platform === 'tiktok')
    if (tiktok?.text) {
      captionText = tiktok.text
    } else {
      captionText = description.platforms[0].text
    }
  }

  // Aggregate hashtags
  let hashtags: string[] = []
  if (description?.hashtag) {
    hashtags.push('#' + description.hashtag)
  }
  if (description?.platforms) {
    for (const p of description.platforms) {
      for (const tag of p.hashtags) {
        const formatted = tag.startsWith('#') ? tag : '#' + tag
        if (!hashtags.includes(formatted)) {
          hashtags.push(formatted)
        }
      }
    }
  }
  // Generic fallback hashtags
  if (hashtags.length === 0) {
    hashtags = ['#viral', '#shorts', '#reels', '#fyp', '#trending']
  }

  const bestPostingTimes = Object.entries(PLATFORM_POSTING_TIMES).map(([platform, times]) => ({
    platform,
    times
  }))

  return { captionText, hashtags, bestPostingTimes }
}

/** Format seconds as "1m 23s" */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

/** Escape a CSV field value */
function csvField(value: string | number | undefined | null): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// ---------------------------------------------------------------------------
// Core manifest generator
// ---------------------------------------------------------------------------

export interface GenerateManifestInput {
  jobs: RenderClipJob[]
  options: RenderBatchOptions
  /** Per-clip metadata supplied by the IPC handler (score, hookText, etc.) */
  clipMeta: ManifestJobMeta[]
  /** Per-clip render result: outputPath (success) or null (failed) */
  clipResults: Map<string, string | null>
  /** Per-clip render durations in ms */
  clipRenderTimes: Map<string, number>
  /** Batch timing */
  totalRenderTimeMs: number
  /** Encoder used */
  encoder: string
  /** Source video name */
  sourceName: string
  /** Source video path */
  sourcePath: string
  /** Source video duration in seconds */
  sourceDuration: number
}

export function generateRenderManifest(input: GenerateManifestInput): RenderManifest {
  const {
    jobs,
    options,
    clipMeta,
    clipResults,
    clipRenderTimes,
    totalRenderTimeMs,
    encoder,
    sourceName,
    sourcePath,
    sourceDuration
  } = input

  const metaMap = new Map(clipMeta.map((m) => [m.clipId, m]))

  let completed = 0
  let failed = 0

  // Resolve global captions mode once — individual clips can override via
  // clipOverrides.enableCaptions but they don't currently override the mode.
  const globalCaptionsMode = options.captionsEnabled === false
    ? 'disabled'
    : (options.captionStyle?.captionMode ?? 'standard')
  const globalAccentColor = options.captionStyle?.accentColor

  const clipEntries: ManifestClipEntry[] = jobs.map((job, index) => {
    const outputPath = clipResults.get(job.clipId) ?? null
    const isSuccess = outputPath !== null
    const meta = metaMap.get(job.clipId)
    const renderTimeMs = clipRenderTimes.get(job.clipId)

    if (isSuccess) completed++
    else failed++

    const hookText = meta?.hookText ?? job.hookTitleText ?? ''
    const reasoning = meta?.reasoning ?? ''
    const transcriptText = meta?.transcriptText ?? ''
    const description = meta?.description ?? job.description

    // Build filename: use the actual output path basename, or derive it
    const filename = outputPath
      ? basename(outputPath)
      : `clip_${index + 1}_${Math.round(job.startTime)}s-${Math.round(job.endTime)}s.mp4`

    // ── Per-clip accent color resolution ──────────────────────────────────
    // 1. clipOverrides.accentColor (explicit per-clip)
    // 2. First stitched/segmented segment accentColor (when present)
    // 3. Global captionStyle.accentColor (batch default)
    const accentColor =
      job.clipOverrides?.accentColor ?? globalAccentColor

    // ── Per-clip captions mode resolution ─────────────────────────────────
    const captionsMode = job.clipOverrides?.enableCaptions === false
      ? 'disabled'
      : globalCaptionsMode

    // ── Archetype: first segmented archetype, else style preset id ─────────
    // `segmentedSegments` carry an archetype per entry (segment-render path).
    // Stitched segments don't carry archetype — we record the style preset id
    // instead, since the stitched render resolves archetypes from the active
    // edit-style template at render time.
    const segmentedArchetype = job.segmentedSegments?.[0]?.archetype
    const resolvedArchetype = segmentedArchetype ?? job.stylePresetId

    return {
      id: job.clipId,
      filename,
      score: meta?.score ?? 0,
      startTime: job.startTime,
      endTime: job.endTime,
      duration: job.endTime - job.startTime,
      hookText,
      sourceVideo: job.sourceVideoPath,
      accentColor,
      captionsMode,
      archetype: resolvedArchetype,
      reasoning,
      status: isSuccess ? 'success' : 'failed',
      transcriptExcerpt: transcriptText.slice(0, 200),
      loopScore: meta?.loopScore,
      renderTimeMs,
      description,
      socialMedia: buildSocialMediaSection(hookText, description)
    }
  })

  const renderTimesArr = Array.from(clipRenderTimes.values()).filter((t) => t > 0)
  const avgRenderTimeMs = renderTimesArr.length > 0
    ? renderTimesArr.reduce((a, b) => a + b, 0) / renderTimesArr.length
    : 0

  return {
    generatedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    source: {
      name: sourceName,
      path: sourcePath,
      duration: sourceDuration
    },
    settings: {
      encoder,
      captionsEnabled: options.captionsEnabled ?? false,
      autoZoomEnabled: options.autoZoom?.enabled ?? false,
      hookTitleEnabled: options.hookTitleOverlay?.enabled ?? false,
      rehookEnabled: options.rehookOverlay?.enabled ?? false
    },
    stats: {
      total: jobs.length,
      completed,
      failed,
      totalRenderTimeMs,
      avgRenderTimeMs: Math.round(avgRenderTimeMs)
    },
    clips: clipEntries
  }
}

// ---------------------------------------------------------------------------
// CSV generation
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'Filename',
  'Score',
  'Start (s)',
  'End (s)',
  'Duration',
  'Hook Text',
  'Source Video',
  'Accent Color',
  'Captions Mode',
  'Archetype',
  'Loop Score',
  'Status',
  'Render Time (s)',
  'Transcript Excerpt',
  'Reasoning',
  'Caption Text',
  'Hashtags',
  'Best TikTok Times',
  'Best Reels Times',
  'Best Shorts Times'
]

function generateManifestCSV(manifest: RenderManifest): string {
  const rows: string[][] = [CSV_HEADERS]

  for (const clip of manifest.clips) {
    const tiktokTimes = clip.socialMedia.bestPostingTimes.find((p) => p.platform === 'TikTok')?.times.join(', ') ?? ''
    const reelsTimes = clip.socialMedia.bestPostingTimes.find((p) => p.platform === 'Instagram Reels')?.times.join(', ') ?? ''
    const shortsTimes = clip.socialMedia.bestPostingTimes.find((p) => p.platform === 'YouTube Shorts')?.times.join(', ') ?? ''

    rows.push([
      clip.filename,
      String(clip.score),
      clip.startTime.toFixed(2),
      clip.endTime.toFixed(2),
      formatDuration(clip.duration),
      clip.hookText,
      clip.sourceVideo,
      clip.accentColor ?? '',
      clip.captionsMode,
      clip.archetype ?? '',
      clip.loopScore !== undefined ? String(clip.loopScore) : '',
      clip.status,
      clip.renderTimeMs !== undefined ? (clip.renderTimeMs / 1000).toFixed(1) : '',
      clip.transcriptExcerpt.replace(/\r?\n/g, ' '),
      clip.reasoning.replace(/\r?\n/g, ' '),
      clip.socialMedia.captionText.replace(/\r?\n/g, ' '),
      clip.socialMedia.hashtags.join(' '),
      tiktokTimes,
      reelsTimes,
      shortsTimes
    ])
  }

  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}

// ---------------------------------------------------------------------------
// Write manifest files to output directory
// ---------------------------------------------------------------------------

export interface WriteManifestResult {
  jsonPath: string
  csvPath: string
}

export function writeManifestFiles(
  manifest: RenderManifest,
  outputDirectory: string
): WriteManifestResult {
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true })
  }

  const jsonPath = join(outputDirectory, 'manifest.json')
  const csvPath = join(outputDirectory, 'manifest.csv')

  writeFileSync(jsonPath, JSON.stringify(manifest, null, 2), 'utf-8')
  writeFileSync(csvPath, generateManifestCSV(manifest), 'utf-8')

  return { jsonPath, csvPath }
}
