// ---------------------------------------------------------------------------
// HyperFrames renderer — high-level API for rendering overlay blocks
//
// Given a block name + data props + timing, this module:
//   1. Resolves the catalog HTML template for the block
//   2. Builds a variables object from the props
//   3. Invokes the engine to render a MOV (ProRes 4444 with alpha)
//   4. Returns the temp file path ready for FFmpeg overlay compositing
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { OUTPUT_WIDTH, OUTPUT_HEIGHT, OUTPUT_FPS } from '../aspect-ratios'
import { renderComposition, type RenderCompositionResult } from './engine'
import type {
  OverlayBlockName,
  OverlayRequest,
  OverlayRenderResult,
  HyperFramePreset,
  PresetCategory
} from './types'

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
// Preset registry
// ---------------------------------------------------------------------------

/** Cache for the parsed presets.json. */
let presetsCache: Record<string, HyperFramePreset> | null = null

function loadPresets(): Record<string, HyperFramePreset> {
  if (presetsCache) return presetsCache

  const presetsPath = join(CATALOG_DIR, 'presets.json')
  if (!existsSync(presetsPath)) {
    console.warn('[HyperFrames] presets.json not found, returning empty registry')
    return {}
  }

  const raw = readFileSync(presetsPath, 'utf-8')
  presetsCache = JSON.parse(raw) as Record<string, HyperFramePreset>
  return presetsCache
}

/**
 * Resolve a named preset into a full OverlayRequest ready for rendering.
 * Returns null if the preset name is not found.
 */
export function resolvePreset(
  presetName: string,
  overrides?: Record<string, unknown>
): OverlayRequest | null {
  const presets = loadPresets()
  const preset = presets[presetName]
  if (!preset) {
    console.warn(`[HyperFrames] Preset "${presetName}" not found in registry`)
    return null
  }

  return {
    block: preset.block,
    props: { ...preset.variables, ...overrides } as OverlayRequest['props'],
    timing: { start: 0, duration: 3 }
  }
}

/**
 * Get all preset names, optionally filtered by category.
 */
export function listPresets(category?: PresetCategory): string[] {
  const presets = loadPresets()
  return Object.entries(presets)
    .filter(([, p]) => !category || p.category === category)
    .map(([name]) => name)
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

  // Base variables shared by all blocks.
  const vars: Record<string, unknown> = {
    text: props.text ?? '',
    color: props.color ?? '#9f75ff',
    fontSize: props.fontSize ?? 36,
    xPos: props.position?.x ?? 50,
    yPos: props.position?.y ?? 50,
    timingStart: timing.start,
    timingDuration: timing.duration
  }

  switch (block) {
    case 'glass-card':
      vars.icon = (props as Record<string, unknown>).icon ?? '🤖'
      vars.title = (props as Record<string, unknown>).title ?? props.text ?? 'AI Agent'
      vars.subtitle = (props as Record<string, unknown>).subtitle ?? ''
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? vars.color
      break

    case 'big-stat':
      vars.number = (props as Record<string, unknown>).number ?? '80%'
      vars.label = (props as Record<string, unknown>).label ?? ''
      vars.prefix = (props as Record<string, unknown>).prefix ?? ''
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? vars.color
      break

    case 'terminal-window':
      vars.title = (props as Record<string, unknown>).title ?? 'AI Agent'
      vars.command = (props as Record<string, unknown>).command ?? '$ deploy'
      vars.output = (props as Record<string, unknown>).output ?? 'Done ✓'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#4ade80'
      break

    case 'checklist':
      vars.title = (props as Record<string, unknown>).title ?? 'Checklist'
      vars.items = (props as Record<string, unknown>).items ?? []
      vars.checked = (props as Record<string, unknown>).checked ?? []
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#4ade80'
      break

    case 'pill-badge':
      vars.icon = (props as Record<string, unknown>).icon ?? '⚡'
      vars.text = (props as Record<string, unknown>).text ?? props.text ?? 'AUTOMATED'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#4ade80'
      vars.glow = (props as Record<string, unknown>).glow ?? true
      break

    case 'before-after':
      vars.leftLabel = (props as Record<string, unknown>).leftLabel ?? 'BEFORE'
      vars.leftValue = (props as Record<string, unknown>).leftValue ?? ''
      vars.leftIcon = (props as Record<string, unknown>).leftIcon ?? '📋'
      vars.rightLabel = (props as Record<string, unknown>).rightLabel ?? 'AFTER'
      vars.rightValue = (props as Record<string, unknown>).rightValue ?? ''
      vars.rightIcon = (props as Record<string, unknown>).rightIcon ?? '🤖'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#4ade80'
      break

    case 'icon-label':
      vars.icon = (props as Record<string, unknown>).icon ?? '🤖'
      vars.label = (props as Record<string, unknown>).label ?? props.text ?? ''
      vars.iconSize = (props as Record<string, unknown>).iconSize ?? 64
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'numbered-step':
      vars.number = (props as Record<string, unknown>).number ?? '1'
      vars.title = (props as Record<string, unknown>).title ?? ''
      vars.description = (props as Record<string, unknown>).description ?? ''
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'icon-grid':
      vars.items = (props as Record<string, unknown>).items ?? []
      vars.columns = (props as Record<string, unknown>).columns ?? 2
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'progress-ring':
      vars.percent = (props as Record<string, unknown>).percent ?? 90
      vars.label = (props as Record<string, unknown>).label ?? ''
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#4ade80'
      vars.size = (props as Record<string, unknown>).size ?? 200
      break

    case 'hud-card':
      vars.title = (props as Record<string, unknown>).title ?? 'AI Agent'
      vars.description = (props as Record<string, unknown>).description ?? ''
      vars.metrics = (props as Record<string, unknown>).metrics ?? []
      vars.statusText = (props as Record<string, unknown>).statusText ?? 'SYSTEM ACTIVE'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'ai-orb':
      vars.icon = (props as Record<string, unknown>).icon ?? '🤖'
      vars.label = (props as Record<string, unknown>).label ?? 'AI Processing'
      vars.sublabel = (props as Record<string, unknown>).sublabel ?? ''
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'wave-line':
      vars.label = (props as Record<string, unknown>).label ?? 'AI Active'
      vars.sublabel = (props as Record<string, unknown>).sublabel ?? ''
      vars.waveType = (props as Record<string, unknown>).waveType ?? 'pulse'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'network-nodes':
      vars.title = (props as Record<string, unknown>).title ?? 'Connected & Integrated'
      vars.nodes = (props as Record<string, unknown>).nodes ?? []
      vars.edges = (props as Record<string, unknown>).edges ?? []
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'stat-bar':
      vars.title = (props as Record<string, unknown>).title ?? 'Performance Metrics'
      vars.bars = (props as Record<string, unknown>).bars ?? []
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#4ade80'
      break

    // Voice agent visualization
    case 'voice-waveform':
      vars.amplitude = (props as Record<string, unknown>).amplitude ?? 0.7
      vars.label = (props as Record<string, unknown>).label ?? 'Voice Active'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'voice-spectrum':
      vars.bands = (props as Record<string, unknown>).bands ?? 24
      vars.label = (props as Record<string, unknown>).label ?? 'Frequency Spectrum'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'agent-avatar':
      vars.icon = (props as Record<string, unknown>).icon ?? '🤖'
      vars.label = (props as Record<string, unknown>).label ?? 'Agent'
      vars.statusText = (props as Record<string, unknown>).statusText ?? 'ONLINE'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'transcript-stream':
      vars.words = (props as Record<string, unknown>).words ?? ['Hello', 'world']
      vars.label = (props as Record<string, unknown>).label ?? 'LIVE TRANSCRIPT'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    // Data visualization
    case 'delos-matrix':
      vars.title = (props as Record<string, unknown>).title ?? 'HOST ATTRIBUTE MATRIX'
      vars.hostId = (props as Record<string, unknown>).hostId ?? 'HC-0001'
      vars.metrics = (props as Record<string, unknown>).metrics ?? [
        { name: 'Cognition', value: 98 },
        { name: 'Emotion', value: 87 },
        { name: 'Fidelity', value: 95 }
      ]
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'delos-biometric':
      vars.identity = (props as Record<string, unknown>).identity ?? 'Unknown'
      vars.pulse = (props as Record<string, unknown>).pulse ?? 72
      vars.stressLevel = (props as Record<string, unknown>).stressLevel ?? 24
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'delos-system-diagnostics':
      vars.title = (props as Record<string, unknown>).title ?? 'SYSTEM DIAGNOSTICS'
      vars.services = (props as Record<string, unknown>).services ?? [
        { name: 'Core', status: 'online' },
        { name: 'Network', status: 'online' },
        { name: 'Memory', status: 'warning' },
        { name: 'GPU', status: 'online' }
      ]
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'delos-tracking-map':
      vars.waypoints = (props as Record<string, unknown>).waypoints ?? [
        { x: 30, y: 40, label: 'A' },
        { x: 60, y: 25, label: 'B' },
        { x: 75, y: 60, label: 'C' }
      ]
      vars.label = (props as Record<string, unknown>).label ?? 'Tracking Active'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'circular-progress':
      vars.percent = (props as Record<string, unknown>).percent ?? 75
      vars.label = (props as Record<string, unknown>).label ?? 'Progress'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      vars.size = (props as Record<string, unknown>).size ?? 180
      break

    case 'sparkline-chart':
      vars.data = (props as Record<string, unknown>).data ?? [30, 45, 35, 60, 55, 70, 65, 80]
      vars.trend = (props as Record<string, unknown>).trend ?? '+12%'
      vars.label = (props as Record<string, unknown>).label ?? 'Trend'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    // Glowing 3D icons
    case 'hologram-orb':
      vars.icon = (props as Record<string, unknown>).icon ?? '🔮'
      vars.label = (props as Record<string, unknown>).label ?? 'Hologram'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'neural-network':
      vars.layers = (props as Record<string, unknown>).layers ?? [3, 5, 5, 3]
      vars.label = (props as Record<string, unknown>).label ?? 'Neural Network'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'data-sphere':
      vars.icon = (props as Record<string, unknown>).icon ?? '🌐'
      vars.label = (props as Record<string, unknown>).label ?? 'Data Sphere'
      vars.points = (props as Record<string, unknown>).points ?? 60
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'glowing-cube':
      vars.icon = (props as Record<string, unknown>).icon ?? '📦'
      vars.label = (props as Record<string, unknown>).label ?? 'Cube'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'energy-ring':
      vars.rings = (props as Record<string, unknown>).rings ?? 4
      vars.label = (props as Record<string, unknown>).label ?? 'Energy Field'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    // Delos tablet pop-ups
    case 'delos-console':
      vars.title = (props as Record<string, unknown>).title ?? 'AI SYSTEM'
      vars.statusText = (props as Record<string, unknown>).statusText ?? 'OPERATIONAL'
      vars.metrics = (props as Record<string, unknown>).metrics ?? [
        { label: 'Uptime', value: '99.9%' },
        { label: 'Hosts', value: '2,048' },
        { label: 'Fidelity', value: '98.7%' }
      ]
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'delos-alert':
      vars.title = (props as Record<string, unknown>).title ?? 'ALERT'
      vars.message = (props as Record<string, unknown>).message ?? 'System anomaly detected'
      vars.severity = (props as Record<string, unknown>).severity ?? 'warning'
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break

    case 'delos-scan-result':
      vars.title = (props as Record<string, unknown>).title ?? 'SCAN COMPLETE'
      vars.findings = (props as Record<string, unknown>).findings ?? ['Fidelity normal', 'No anomalies', 'Memory intact']
      vars.progress = (props as Record<string, unknown>).progress ?? 100
      vars.accentColor = (props as Record<string, unknown>).accentColor ?? '#9f75ff'
      break
  }

  return vars
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a single overlay block to a temp MOV file with alpha channel.
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
    quality: 'high',
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
 * Render a named preset with optional variable overrides.
 */
export async function renderPreset(
  presetName: string,
  overrides?: Record<string, unknown>,
  timing?: { start: number; duration: number }
): Promise<OverlayRenderResult | null> {
  const request = resolvePreset(presetName, overrides)
  if (!request) return null

  if (timing) {
    request.timing = timing
  }

  return renderOverlay(request)
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
