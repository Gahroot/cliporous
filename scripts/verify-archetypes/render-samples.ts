/**
 * Archetype verification harness.
 *
 * Renders each PRESTYJ archetype against a short sample clip using the same
 * `renderSegmentedClip` path the in-app preview uses, then writes the resulting
 * MP4s into .ezcoder/plans/renders/ for ffmpeg-frame comparison against the
 * reference videos in .ezcoder/examples/.
 *
 * Run via: tsx-style bundle in scripts/verify-archetypes/run.sh
 */

import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  renderSegmentedClip,
  type SegmentRenderConfig,
  type ResolvedSegment
} from '../../src/main/render/segment-render'
import { getEditStyleById } from '../../src/main/edit-styles'
import { resolveTemplate } from '../../src/main/edit-styles'
import { ARCHETYPE_DEFAULT_TRANSITION_IN } from '../../src/main/edit-styles/shared/archetypes'
import type { Archetype } from '../../src/main/edit-styles/shared/archetypes'
import { getVideoMetadata } from '../../src/main/ffmpeg'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../../src/main/aspect-ratios'
import { computeCenterCropForRatio } from '../../src/main/aspect-ratios'

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const SAMPLE_VIDEO = '/home/groot/batchcontent/sample_video/test_clip.mp4'
const SAMPLE_SRT = '/home/groot/batchcontent/sample_video/1 thing make claude better.srt'
const SAMPLE_IMAGE = '/home/groot/batchcontent/sample_video/clip_edit_ui.png'
const RENDERS_DIR = join(PROJECT_ROOT, '.ezcoder', 'plans', 'renders')

interface ArchetypeJob {
  archetype: Archetype
  outputName: string
  /** Optional overlay text override. quote-lower / hero archetypes need this. */
  overlayText?: string
}

const JOBS: ArchetypeJob[] = [
  // 1. Intro (fullscreen-headline) — big title + dark brand bg.
  { archetype: 'fullscreen-headline', outputName: 'render_fullscreen-headline_intro.mp4', overlayText: '1 thing\nmake Claude\nbetter' },
  // 2. Full screen talking head.
  { archetype: 'talking-head', outputName: 'render_talking-head.mp4' },
  // 3. Full screen b-roll w subtitles → fullscreen-image (with imagePath).
  { archetype: 'fullscreen-image', outputName: 'render_fullscreen-image.mp4' },
  // 4. Just subtitles example → fullscreen-quote (solid bg + center text).
  { archetype: 'fullscreen-quote', outputName: 'render_fullscreen-quote.mp4', overlayText: 'Claude keeps\nmissing the mark' },
  // 5. Split screen talking = b-roll → split-image (top-bottom + image).
  { archetype: 'split-image', outputName: 'render_split-image.mp4' }
]

interface SrtCue {
  start: number
  end: number
  text: string
}

function parseSrtTime(s: string): number {
  // 00:00:00,966
  const m = s.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/)
  if (!m) return 0
  const [, h, mm, ss, ms] = m
  return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000
}

function parseSrt(path: string): SrtCue[] {
  const raw = readFileSync(path, 'utf-8').replace(/\r/g, '')
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean)
  const cues: SrtCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 2) continue
    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue
    const [a, b] = timeLine.split('-->').map((s) => s.trim())
    const textLines = lines.slice(lines.findIndex((l) => l.includes('-->')) + 1)
    cues.push({ start: parseSrtTime(a), end: parseSrtTime(b), text: textLines.join(' ').trim() })
  }
  return cues
}

/**
 * Convert SRT cues into per-word timestamps. The sample SRT is already short
 * phrases (~3 words / cue), so we evenly distribute words within each cue.
 */
function srtToWords(cues: SrtCue[]): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = []
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    const dur = Math.max(0.001, cue.end - cue.start)
    const per = dur / words.length
    for (let i = 0; i < words.length; i++) {
      out.push({
        text: words[i],
        start: cue.start + per * i,
        end: cue.start + per * (i + 1)
      })
    }
  }
  return out
}

async function renderOne(job: ArchetypeJob, allWords: { text: string; start: number; end: number }[]): Promise<string> {
  const editStyle = getEditStyleById('prestyj')!
  const tpl = resolveTemplate(job.archetype, 'prestyj')
  const meta = await getVideoMetadata(SAMPLE_VIDEO)

  // Use seconds 0..6 of the sample (≈ enough words to populate 4-WPL captions
  // without burying the differences between archetypes).
  const startTime = 0
  const endTime = 6

  const wordsInRange = allWords.filter((w) => w.start < endTime && w.end > startTime)

  // Compute a center crop for the source so talking-head archetypes have a
  // sensible crop region (the renderer expects 9:16 inside the source frame).
  const cropRect = computeCenterCropForRatio(meta.width, meta.height)

  const seg: ResolvedSegment = {
    startTime,
    endTime,
    styleVariant: tpl.variant,
    zoom: { style: tpl.zoomStyle, intensity: tpl.zoomIntensity },
    transitionIn: ARCHETYPE_DEFAULT_TRANSITION_IN[job.archetype] ?? editStyle.defaultTransition,
    overlayText: job.overlayText ?? tpl.layoutParamOverrides.overlayText as string | undefined,
    accentColor: tpl.layoutParamOverrides.accentColor as string | undefined,
    captionBgOpacity: tpl.layoutParamOverrides.captionBgOpacity as number | undefined,
    backgroundColor: tpl.layoutParamOverrides.backgroundColor as string | undefined,
    imagePath:
      job.archetype === 'fullscreen-image' || job.archetype === 'split-image'
        ? SAMPLE_IMAGE
        : undefined,
    archetype: job.archetype,
    captionMarginV: tpl.captionMarginV,
    cropRect
  }

  const cfg: SegmentRenderConfig = {
    sourceVideoPath: SAMPLE_VIDEO,
    segments: [seg],
    editStyle,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    fps: OUTPUT_FPS,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    defaultCropRect: cropRect,
    wordTimestamps: wordsInRange,
    captionStyle: editStyle.captionStyle,
    captionsEnabled: true,
    userAccentColor: editStyle.accentColor,
    soundPlacements: []
  }

  const outPath = join(RENDERS_DIR, job.outputName)
  console.log(`\n=== Rendering ${job.archetype} → ${outPath} ===`)
  await renderSegmentedClip(cfg, outPath, (p) => {
    if (p % 10 === 0) process.stdout.write(`  ${p}%\n`)
  })
  return outPath
}

async function main(): Promise<void> {
  if (!existsSync(SAMPLE_VIDEO)) {
    throw new Error(`Sample video missing: ${SAMPLE_VIDEO}`)
  }
  if (!existsSync(SAMPLE_SRT)) {
    throw new Error(`Sample SRT missing: ${SAMPLE_SRT}`)
  }
  if (!existsSync(SAMPLE_IMAGE)) {
    throw new Error(`Sample image missing: ${SAMPLE_IMAGE}`)
  }
  mkdirSync(RENDERS_DIR, { recursive: true })

  const cues = parseSrt(SAMPLE_SRT)
  const words = srtToWords(cues)
  console.log(`Loaded ${cues.length} cues / ${words.length} words from SRT`)

  const onlyArg = process.argv[2]
  const jobs = onlyArg ? JOBS.filter((j) => j.archetype === onlyArg) : JOBS
  if (onlyArg && jobs.length === 0) {
    throw new Error(`No archetype matches: ${onlyArg}`)
  }

  const results: Array<{ job: ArchetypeJob; path: string; ok: boolean; error?: string }> = []
  for (const job of jobs) {
    try {
      const path = await renderOne(job, words)
      results.push({ job, path, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[FAIL] ${job.archetype}: ${msg}`)
      results.push({ job, path: '', ok: false, error: msg })
    }
  }

  console.log('\n=== Summary ===')
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.job.archetype.padEnd(22)} ${r.ok ? r.path : r.error}`)
  }
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[Fatal]', err)
  process.exit(1)
})
