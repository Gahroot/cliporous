// ---------------------------------------------------------------------------
// Long-form (16:9) render orchestrator — Hormozi-style talking head.
//
// Entry point for `outputProfile === 'longform'`. Builds a segment timeline
// from the AI edit plan, pre-renders concept cards / section headers via
// Remotion, encodes speaker blocks through the landscape layout, concatenates
// everything, then composites phrase-emphasis overlays in a final pass.
//
// This path is fully independent of the 9:16 feature pipeline so the locked
// short-form output stays byte-identical.
// ---------------------------------------------------------------------------

import { BrowserWindow } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { basename, extname, join } from 'path'
import { tmpdir } from 'os'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'

import { ffmpeg, getEncoder, getVideoMetadata } from '../ffmpeg'
import {
  LANDSCAPE_WIDTH,
  LANDSCAPE_HEIGHT,
  LANDSCAPE_FPS
} from '../aspect-ratios'
import { getEditStyleById } from '../edit-styles/index'
import { LONGFORM_TEMPLATES } from '../edit-styles/index'
import { buildLongformLayout } from '../layouts/longform-layouts'
import { buildDriftZoom, buildSnapZoom } from '../zoom-filters'
import { buildEditStyleColorGradeFilter } from './color-grade-filter'
import { resolveQualityParams } from './quality'
import { toFFmpegPath } from './helpers'
import { encodeSpeakerSegment } from './longform-encode'
import { renderConceptCardSegment } from './features/concept-cards.feature'
import { renderSectionHeaderSegment } from './features/section-header.feature'
import {
  applyPhraseOverlays,
  cleanupPhraseOverlayTempFiles
} from './features/phrase-emphasis.feature'

import type { RenderBatchOptions } from './types'
import type {
  LongformEditPlan,
  LongformArchetype,
  ConceptCardPlacement,
  SectionBoundary,
  PhraseEmphasis
} from '@shared/types'

const HORMOZI_STYLE_ID = 'hormozi'

// ---------------------------------------------------------------------------
// Timeline model
// ---------------------------------------------------------------------------

interface SpeakerBlock {
  kind: 'speaker'
  startTime: number
  endTime: number
}

interface CardBlock {
  kind: 'concept-card'
  startTime: number
  endTime: number
  card: ConceptCardPlacement
}

interface SectionBlock {
  kind: 'section-header'
  startTime: number
  endTime: number
  section: SectionBoundary
}

type TimelineBlock = SpeakerBlock | CardBlock | SectionBlock

const MIN_BLOCK_SECONDS = 0.4

/**
 * Build a non-overlapping, chronological timeline. Concept cards and section
 * headers are inserts that replace the speaker visual for their range; speaker
 * blocks fill every gap. Overlapping inserts are dropped (first one wins).
 */
function buildTimeline(plan: LongformEditPlan, videoDuration: number): TimelineBlock[] {
  type Insert = CardBlock | SectionBlock
  const inserts: Insert[] = []

  for (const card of plan.conceptCards) {
    inserts.push({ kind: 'concept-card', startTime: card.startTime, endTime: card.endTime, card })
  }
  for (const section of plan.sections) {
    inserts.push({
      kind: 'section-header',
      startTime: section.startTime,
      endTime: section.endTime,
      section
    })
  }

  inserts.sort((a, b) => a.startTime - b.startTime)

  // Drop overlaps + clamp to [0, videoDuration].
  const accepted: Insert[] = []
  let lastEnd = 0
  for (const ins of inserts) {
    const start = Math.max(0, ins.startTime)
    const end = Math.min(videoDuration, ins.endTime)
    if (end - start < MIN_BLOCK_SECONDS) continue
    if (start < lastEnd) continue // overlaps a prior insert — skip
    accepted.push({ ...ins, startTime: start, endTime: end })
    lastEnd = end
  }

  const timeline: TimelineBlock[] = []
  let cursor = 0
  for (const ins of accepted) {
    if (ins.startTime - cursor >= MIN_BLOCK_SECONDS) {
      timeline.push({ kind: 'speaker', startTime: cursor, endTime: ins.startTime })
    }
    timeline.push(ins)
    cursor = ins.endTime
  }
  if (videoDuration - cursor >= MIN_BLOCK_SECONDS) {
    timeline.push({ kind: 'speaker', startTime: cursor, endTime: videoDuration })
  }

  // Fallback: no inserts at all → one speaker block spanning the whole video.
  if (timeline.length === 0) {
    timeline.push({ kind: 'speaker', startTime: 0, endTime: videoDuration })
  }

  return timeline
}

// ---------------------------------------------------------------------------
// Concat (demuxer, stream copy)
// ---------------------------------------------------------------------------

function concatSegments(segmentFiles: string[], outputPath: string): Promise<void> {
  const listFile = join(tmpdir(), `batchcontent-lf-list-${Date.now()}.txt`)
  const listContent = segmentFiles
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(listFile, listContent, 'utf-8')

  return new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart', '-y'])
      .on('end', () => {
        try {
          unlinkSync(listFile)
        } catch {
          /* ignore */
        }
        resolve()
      })
      .on('error', (err: Error) => {
        try {
          unlinkSync(listFile)
        } catch {
          /* ignore */
        }
        reject(err)
      })
      .save(toFFmpegPath(outputPath))
  })
}

// ---------------------------------------------------------------------------
// Speaker zoom — snap to overlapping phrase beats, else gentle drift.
// ---------------------------------------------------------------------------

function buildSpeakerZoom(
  block: SpeakerBlock,
  intensity: number,
  style: 'none' | 'drift' | 'snap' | 'word-pulse' | 'zoom-out',
  phrases: PhraseEmphasis[]
): string {
  if (style === 'none' || intensity <= 1.001) return ''
  const duration = block.endTime - block.startTime

  if (style === 'snap') {
    const local = phrases
      .filter((p) => p.endTime > block.startTime && p.startTime < block.endTime)
      .map((p) => {
        const cs = Math.max(p.startTime, block.startTime)
        const ce = Math.min(p.endTime, block.endTime)
        return { time: cs - block.startTime, duration: ce - cs }
      })
    if (local.length > 0) {
      return buildSnapZoom({
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        duration,
        zoomIntensity: intensity,
        startTime: 0,
        emphasisTimestamps: local
      })
    }
  }

  return buildDriftZoom({
    width: LANDSCAPE_WIDTH,
    height: LANDSCAPE_HEIGHT,
    fps: LANDSCAPE_FPS,
    duration,
    zoomIntensity: intensity,
    startTime: 0
  })
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render a long-form (16:9) Hormozi-style video. Expects exactly one job in
 * `options.jobs` (the full source video) and `options.longformEditPlan`.
 */
export async function renderLongformVideo(
  options: RenderBatchOptions,
  window: BrowserWindow
): Promise<void> {
  const { jobs, outputDirectory } = options
  const job = jobs[0]

  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true })
  }

  const sendError = (message: string): void => {
    window.webContents.send(Ch.Send.RENDER_CLIP_ERROR, {
      clipId: job?.clipId ?? 'longform',
      error: message
    })
    window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 0, failed: 1, total: 1 })
  }

  if (!job) {
    sendError('Long-form render requires a source job.')
    return
  }
  const plan = options.longformEditPlan
  if (!plan) {
    sendError('Long-form render requires a longformEditPlan.')
    return
  }

  const qualityParams = resolveQualityParams(options.renderQuality)
  const encoder = getEncoder(qualityParams)
  const encoderIsHardware =
    encoder.encoder === 'h264_nvenc' || encoder.encoder === 'h264_qsv'

  window.webContents.send(Ch.Send.RENDER_CLIP_START, {
    clipId: job.clipId,
    index: 0,
    total: 1,
    encoder: encoder.encoder,
    encoderIsHardware
  })

  const tempFiles: string[] = []

  try {
    const meta = await getVideoMetadata(job.sourceVideoPath)
    const videoDuration =
      job.endTime > job.startTime ? job.endTime : meta.duration

    const editStyle = getEditStyleById(HORMOZI_STYLE_ID)
    const speakerTemplate = LONGFORM_TEMPLATES[HORMOZI_STYLE_ID]?.speaker
    const zoomStyle = speakerTemplate?.zoomStyle ?? 'snap'
    const zoomIntensity = speakerTemplate?.zoomIntensity ?? 1.12
    const colorGradeFilter = editStyle?.colorGrade
      ? buildEditStyleColorGradeFilter(editStyle.colorGrade)
      : null

    const timeline = buildTimeline(plan, videoDuration)

    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: `Planning ${timeline.length} long-form segment(s)…`,
      percent: 5
    })

    // ── Encode every timeline block to a normalized segment ────────────────
    const segmentFiles: string[] = []
    for (let i = 0; i < timeline.length; i++) {
      const block = timeline[i]
      const base = 5 + Math.round((i / timeline.length) * 65) // 5 → 70%

      if (block.kind === 'speaker') {
        window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: base })
        const duration = block.endTime - block.startTime
        const layout = buildLongformLayout('speaker' as LongformArchetype, {
          width: LANDSCAPE_WIDTH,
          height: LANDSCAPE_HEIGHT,
          segmentDuration: duration,
          fps: LANDSCAPE_FPS,
          sourceWidth: meta.width,
          sourceHeight: meta.height,
          cropRect: job.cropRegion
        })
        const zoomFilter = buildSpeakerZoom(block, zoomIntensity, zoomStyle, plan.phrases)
        const extraFilters = [zoomFilter, colorGradeFilter ?? ''].filter(Boolean)
        const out = join(tmpdir(), `batchcontent-lf-speaker-${Date.now()}-${i}.mp4`)
        await encodeSpeakerSegment({
          sourceVideoPath: job.sourceVideoPath,
          outputPath: out,
          startTime: block.startTime,
          duration,
          fps: LANDSCAPE_FPS,
          layout,
          extraFilters
        })
        segmentFiles.push(out)
        tempFiles.push(out)
      } else if (block.kind === 'concept-card') {
        window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
          clipId: job.clipId,
          message: 'Rendering concept card…',
          percent: base
        })
        const out = await renderConceptCardSegment({
          card: block.card,
          sourceVideoPath: job.sourceVideoPath,
          width: LANDSCAPE_WIDTH,
          height: LANDSCAPE_HEIGHT,
          fps: LANDSCAPE_FPS
        })
        segmentFiles.push(out)
        tempFiles.push(out)
      } else {
        window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
          clipId: job.clipId,
          message: 'Rendering section header…',
          percent: base
        })
        const out = await renderSectionHeaderSegment({
          section: block.section,
          sourceVideoPath: job.sourceVideoPath,
          width: LANDSCAPE_WIDTH,
          height: LANDSCAPE_HEIGHT,
          fps: LANDSCAPE_FPS
        })
        segmentFiles.push(out)
        tempFiles.push(out)
      }
    }

    if (segmentFiles.length === 0) {
      throw new Error('Long-form timeline produced no segments.')
    }

    // ── Concat ─────────────────────────────────────────────────────────────
    window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 72 })
    const concatPath = join(tmpdir(), `batchcontent-lf-concat-${Date.now()}.mp4`)
    tempFiles.push(concatPath)
    await concatSegments(segmentFiles, concatPath)

    // ── Phrase overlay pass ──────────────────────────────────────────────────
    const sourceName = options.sourceMeta?.name
      ? basename(options.sourceMeta.name, extname(options.sourceMeta.name))
      : basename(job.sourceVideoPath, extname(job.sourceVideoPath))
    const outputPath = join(outputDirectory, `${sourceName}_longform.mp4`)

    // Phrases map directly onto the concatenated timeline (every block preserves
    // source-time audio 1:1, so concat time == absolute source time — no remap).
    // Keep only phrases that begin inside a SPEAKER block: a phrase composited
    // over a full-frame concept card / section header would obscure it and read
    // as a bug, since phrase overlays are meant to float over the speaker.
    const speakerRanges = timeline
      .filter((b): b is SpeakerBlock => b.kind === 'speaker')
      .map((b) => ({ start: b.startTime, end: b.endTime }))
    const inSpeakerBlock = (t: number): boolean =>
      speakerRanges.some((r) => t >= r.start && t < r.end)
    const phrases = plan.phrases.filter(
      (p) => p.endTime > p.startTime && p.startTime < videoDuration && inSpeakerBlock(p.startTime)
    )

    window.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
      clipId: job.clipId,
      message: `Compositing ${phrases.length} phrase overlay(s)…`,
      percent: 78
    })

    let overlayTempFiles: string[] = []
    if (phrases.length > 0) {
      const result = await applyPhraseOverlays({
        inputPath: concatPath,
        outputPath,
        phrases,
        width: LANDSCAPE_WIDTH,
        height: LANDSCAPE_HEIGHT,
        fps: LANDSCAPE_FPS,
        qualityParams
      })
      overlayTempFiles = result.tempFiles
    } else {
      // No phrases — re-encode the concat to the user's quality at the final path.
      await reencodeToFinal(concatPath, outputPath, qualityParams)
    }

    window.webContents.send(Ch.Send.RENDER_CLIP_PROGRESS, { clipId: job.clipId, percent: 100 })
    window.webContents.send(Ch.Send.RENDER_CLIP_DONE, { clipId: job.clipId, outputPath })
    window.webContents.send(Ch.Send.RENDER_BATCH_DONE, { completed: 1, failed: 0, total: 1 })

    cleanupPhraseOverlayTempFiles(overlayTempFiles)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendError(`Long-form render failed: ${message}`)
  } finally {
    for (const f of tempFiles) {
      try {
        unlinkSync(f)
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Final re-encode (no-phrase path)
// ---------------------------------------------------------------------------

function reencodeToFinal(
  inputPath: string,
  outputPath: string,
  qualityParams: ReturnType<typeof resolveQualityParams>
): Promise<void> {
  const { encoder, presetFlag } = getEncoder(qualityParams)
  return new Promise<void>((resolve, reject) => {
    ffmpeg(toFFmpegPath(inputPath))
      .outputOptions([
        '-c:v', encoder,
        ...presetFlag,
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .save(toFFmpegPath(outputPath))
  })
}
