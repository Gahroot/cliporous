// ---------------------------------------------------------------------------
// HyperFrames renderer — high-level API for rendering overlay blocks
//
// Given a block name + data props + timing, this module:
//   1. Resolves the catalog HTML template for the block
//   2. Builds a variables object from the props
//   3. Invokes the engine to render a MOV (ProRes 4444 with alpha)
//   4. Returns the temp file path ready for FFmpeg overlay compositing
// ---------------------------------------------------------------------------

import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../aspect-ratios'
import { renderComposition, type RenderCompositionResult } from './engine'
import type { OverlayBlockName, OverlayRequest, OverlayRenderResult } from './types'

// ---------------------------------------------------------------------------
// Catalog resolution
// ---------------------------------------------------------------------------

/** Absolute path to the catalog directory containing HTML templates. */
const CATALOG_DIR = join(__dirname, 'catalog')

/** Cache: block name → absolute path to its HTML template. */
const templateCache = new Map<OverlayBlockName, string>()

function resolveTemplatePath(block: OverlayBlockName): string {
  const cached = templateCache.get(block)
  if (cached) return cached

  const path = join(CATALOG_DIR, `${block}.html`)
  if (!existsSync(path)) {
    throw new Error(`[HyperFrames] Catalog template not found: ${path}`)
  }

  templateCache.set(block, path)
  return path
}

// ---------------------------------------------------------------------------
// Variable builders per block type
// ---------------------------------------------------------------------------

/**
 * Convert an overlay request's props into a variables object that the
 * HTML composition reads via `window.__hyperframes.getVariables()`.
 */
function buildVariables(request: OverlayRequest): Record<string, unknown> {
  const { block, props, timing } = request
  const vars: Record<string, unknown> = {
    text: props.text ?? '',
    color: props.color ?? '#9f75ff',
    fontSize: props.fontSize ?? 36,
    xPos: props.position?.x ?? 50,
    yPos: props.position?.y ?? 30
  }

  // Block-specific props.
  switch (block) {
    case 'popup-card':
      vars.subtitle = (props as Record<string, unknown>).subtitle ?? ''
      vars.icon = (props as Record<string, unknown>).icon ?? ''
      vars.borderRadius = (props as Record<string, unknown>).borderRadius ?? 20
      break

    case 'icon-callout':
      vars.icon = (props as Record<string, unknown>).icon ?? '★'
      vars.iconSize = (props as Record<string, unknown>).iconSize ?? 64
      break

    case 'animated-label':
      vars.animation = (props as Record<string, unknown>).animation ?? 'typewriter'
      break

    case 'progress-indicator':
      vars.steps = (props as Record<string, unknown>).steps ?? 4
      vars.currentStep = (props as Record<string, unknown>).currentStep ?? 2
      vars.style = (props as Record<string, unknown>).style ?? 'dots'
      break

    case 'glowing-badge':
      vars.glowIntensity = (props as Record<string, unknown>).glowIntensity ?? 5
      vars.shape = (props as Record<string, unknown>).shape ?? 'pill'
      break
  }

  // Timing is embedded so the HTML can use data-duration if needed.
  vars.timingStart = timing.start
  vars.timingDuration = timing.duration

  return vars
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a single overlay block to a temp MOV file with alpha channel.
 *
 * @param request - Block name, props, and timing.
 * @returns Path to the temp MOV file, ready for FFmpeg overlay compositing.
 */
export async function renderOverlay(request: OverlayRequest): Promise<OverlayRenderResult> {
  const templatePath = resolveTemplatePath(request.block)
  const variables = buildVariables(request)
  const uniqueId = `${request.block}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const outputPath = join(tmpdir(), `batchcontent-hf-overlay-${uniqueId}.mov`)

  const result: RenderCompositionResult = await renderComposition({
    compositionPath: templatePath,
    outputPath,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    fps: OUTPUT_FPS,
    quality: 'standard',
    variables,
    durationSeconds: request.timing.duration
  })

  return {
    movPath: result.outputPath,
    duration: request.timing.duration,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT
  }
}

/**
 * Render multiple overlay blocks in sequence. Returns results in the same
 * order as the input requests. Failures for individual blocks are caught
 * and logged — other blocks continue.
 */
export async function renderOverlays(
  requests: OverlayRequest[]
): Promise<OverlayRenderResult[]> {
  const results: OverlayRenderResult[] = []

  for (const request of requests) {
    try {
      const result = await renderOverlay(request)
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[HyperFrames] Failed to render overlay block "${request.block}": ${message}`
      )
      // Push a null result so the index stays aligned with the request.
      results.push({
        movPath: '',
        duration: request.timing.duration,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT
      })
    }
  }

  return results
}
