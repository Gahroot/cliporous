// ---------------------------------------------------------------------------
// HyperFrames overlay types — shared between engine, renderer, and feature
// ---------------------------------------------------------------------------

export type OverlayBlockName =
  | 'glass-card' | 'big-stat' | 'terminal-window' | 'checklist' | 'pill-badge'
  | 'before-after' | 'icon-label' | 'numbered-step' | 'icon-grid' | 'progress-ring'
  | 'hud-card' | 'ai-orb' | 'wave-line' | 'network-nodes' | 'stat-bar'
  // Voice agent visualization
  | 'voice-waveform' | 'voice-spectrum' | 'agent-avatar' | 'transcript-stream'
  // Data visualization
  | 'delos-matrix' | 'delos-biometric' | 'delos-system-diagnostics' | 'delos-tracking-map'
  | 'circular-progress' | 'sparkline-chart'
  // Glowing 3D icons
  | 'hologram-orb' | 'neural-network' | 'data-sphere' | 'glowing-cube' | 'energy-ring'
  // Delos tablet pop-ups
  | 'delos-console' | 'delos-alert' | 'delos-scan-result'

export type PresetCategory =
  | 'money' | 'time' | 'ai' | 'comparison' | 'list' | 'setup' | 'transition'
  | 'voice' | 'biometric' | 'data-viz' | 'hologram'

export interface PresetMetadata {
  description: string
  triggerKeywords: string[]
  topics: string[]
}

export interface HyperFramePreset {
  block: OverlayBlockName
  category: PresetCategory
  metadata: PresetMetadata
  variables: Record<string, unknown>
}

export interface OverlayPosition { x: number; y: number }
export interface OverlayTiming { start: number; duration: number }
export interface BaseOverlayProps { text?: string; color?: string; fontSize?: number; position?: OverlayPosition }

export interface OverlayRequest {
  block: OverlayBlockName
  props: BaseOverlayProps
  timing: OverlayTiming
}

export interface OverlayRenderResult {
  movPath: string; duration: number; width: number; height: number
}
