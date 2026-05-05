// ---------------------------------------------------------------------------
// Filename template resolution — extracted from render-pipeline.ts
// ---------------------------------------------------------------------------

import { join, basename, extname } from 'path'
import { sanitizeFilename } from './helpers'
import type { RenderClipJob } from './types'

/**
 * Slugify a string for use inside a filename:
 * lowercase, spaces → hyphens, strip non-alphanumeric (except hyphens), collapse hyphens.
 */
export function slugify(text: string, maxLen = 30): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}

/** Format seconds as MM-SS (e.g. 125 → '02-05'). */
export function formatMMSS(seconds: number): string {
  const s = Math.round(seconds)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}-${ss}`
}

/** Zero-pad a number to at least 2 digits. */
export function zeroPad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Resolve a filename template string with per-clip variables.
 *
 * Available variables:
 *   {source}   — source video name without extension
 *   {index}    — 1-based clip index, zero-padded (01, 02, …)
 *   {score}    — AI viral score (0–100)
 *   {hook}     — hook text slugified (lowercase, spaces→hyphens, max 30 chars)
 *   {duration} — clip duration in seconds (rounded)
 *   {start}    — clip start time as MM-SS
 *   {end}      — clip end time as MM-SS
 *   {date}     — render date as YYYY-MM-DD
 *   {quality}  — quality preset name (draft / normal / high / custom)
 *
 * Output is sanitized and truncated to 200 chars.
 */
export function resolveFilenameTemplate(
  template: string,
  variables: {
    source: string
    index: number
    score: number
    hook: string
    duration: number
    startTime: number
    endTime: number
    quality: string
  }
): string {
  const today = new Date()
  const dateStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-')

  const resolved = template
    .replace(/\{source\}/g, sanitizeFilename(variables.source))
    .replace(/\{index\}/g, zeroPad(variables.index))
    .replace(/\{score\}/g, String(Math.round(variables.score)))
    .replace(/\{hook\}/g, slugify(variables.hook))
    .replace(/\{duration\}/g, String(Math.round(variables.duration)))
    .replace(/\{start\}/g, formatMMSS(variables.startTime))
    .replace(/\{end\}/g, formatMMSS(variables.endTime))
    .replace(/\{date\}/g, dateStr)
    .replace(/\{quality\}/g, variables.quality)

  // Strip illegal chars, collapse whitespace, limit length
  return sanitizeFilename(resolved).replace(/\s+/g, '_').slice(0, 200) || 'clip'
}

/**
 * Build the full output file path for a rendered clip.
 * Uses the job's outputFileName if set, otherwise resolves the filename template.
 */
export function buildOutputPath(
  outputDirectory: string,
  job: RenderClipJob,
  index: number,
  outputFormat: 'mp4' | 'webm' = 'mp4',
  filenameTemplate?: string,
  extraVars?: { score?: number; quality?: string }
): string {
  const ext = `.${outputFormat}`
  if (job.outputFileName) {
    const name = sanitizeFilename(job.outputFileName)
    // Strip any existing extension then add the correct one
    const base = name.replace(/\.(mp4|webm)$/i, '')
    return join(outputDirectory, `${base}${ext}`)
  }
  const srcBase = basename(job.sourceVideoPath, extname(job.sourceVideoPath))
  const template = filenameTemplate ?? DEFAULT_FILENAME_TEMPLATE
  const name = resolveFilenameTemplate(template, {
    source: srcBase,
    index: index + 1,
    score: extraVars?.score ?? job.manifestMeta?.score ?? 0,
    hook: job.hookTitleText ?? '',
    duration: job.endTime - job.startTime,
    startTime: job.startTime,
    endTime: job.endTime,
    quality: extraVars?.quality ?? 'normal'
  })
  return join(outputDirectory, `${name}${ext}`)
}
