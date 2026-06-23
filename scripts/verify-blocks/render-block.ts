/**
 * Long-form block smoke render.
 *
 * Exercises the full block feature path end-to-end:
 *   resolveLongformBlockCompositionId → Remotion headless render → audio mux
 *
 * It generates a tiny synthetic source video (color + sine audio) with the
 * bundled ffmpeg so no external sample asset is required, then renders one
 * `BlockPlacement` through `renderBlockSegment` exactly as the long-form
 * pipeline does. Pass a block kind as argv[2] (default: bar-chart).
 *
 * Run via: scripts/verify-blocks/run.sh [kind]
 */

import { mkdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

import { renderBlockSegment } from '../../src/main/render/features/blocks.feature'
import { DEFAULT_LONGFORM_BLOCK_SKIN } from '../../src/main/remotion/registry'
import { LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, LANDSCAPE_FPS } from '../../src/main/aspect-ratios'
import type { BlockPlacement, LongformBlockKind } from '@shared/types'

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const OUT_DIR = join(PROJECT_ROOT, '.ezcoder', 'plans', 'renders')

/** A representative placement per kind so any kind can be smoke-rendered. */
function placementFor(kind: LongformBlockKind): BlockPlacement {
  const span = { startTime: 0, endTime: 3 }
  const common = { ...span, kicker: 'THE NUMBERS', heading: 'Smoke Test Block' }
  switch (kind) {
    case 'bar-chart':
      return {
        kind,
        ...common,
        bars: [
          { label: 'Q1', value: 0.42, valueLabel: '$84K' },
          { label: 'Q2', value: 0.74, valueLabel: '$148K' },
          { label: 'Q3', value: 1.0, valueLabel: '$201K' }
        ]
      }
    case 'numbered-list':
      return {
        kind,
        ...common,
        items: [
          { text: 'Validate the pain', detail: 'Ten conversations first' },
          { text: 'Pre-sell the offer' },
          { text: 'Ship the ugly version' }
        ]
      }
    case 'stat-hero':
      return {
        kind,
        ...common,
        value: 1.2,
        decimals: 1,
        prefix: '$',
        suffix: 'M',
        label: 'Up from $310K',
        trend: 'up',
        delta: '+287%'
      }
    default:
      // Fall back to a numbered-list shape for kinds not explicitly sampled.
      return {
        kind: 'numbered-list',
        ...common,
        items: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }]
      }
  }
}

function makeSampleVideo(): string {
  const out = join(OUT_DIR, 'block-smoke-source.mp4')
  const ff = ffmpegPath as unknown as string
  const args = [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=0x101018:s=1920x1080:d=4:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    out
  ]
  const res = spawnSync(ff, args, { stdio: 'inherit' })
  if (res.status !== 0) throw new Error('Failed to generate sample source video')
  return out
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const kind = (process.argv[2] as LongformBlockKind) || 'bar-chart'

  console.log(`[smoke] generating sample source video…`)
  const sourceVideoPath = makeSampleVideo()

  console.log(`[smoke] rendering block kind="${kind}" skin="${DEFAULT_LONGFORM_BLOCK_SKIN}"…`)
  const outPath = await renderBlockSegment({
    placement: placementFor(kind),
    skinId: DEFAULT_LONGFORM_BLOCK_SKIN,
    sourceVideoPath,
    width: LANDSCAPE_WIDTH,
    height: LANDSCAPE_HEIGHT,
    fps: LANDSCAPE_FPS
  })

  if (!existsSync(outPath) || statSync(outPath).size === 0) {
    throw new Error(`Block segment was not produced: ${outPath}`)
  }
  console.log(`[smoke] OK → ${outPath} (${statSync(outPath).size} bytes)`)
}

main().catch((err) => {
  console.error('[smoke] FAIL', err)
  process.exit(1)
})
