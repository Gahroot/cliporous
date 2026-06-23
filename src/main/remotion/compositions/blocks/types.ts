/* ------------------------------------------------------------------ */
/*  Block prop interfaces — Westworld/Delos data card system            */
/* ------------------------------------------------------------------ */

export interface DataCardProps {
  /** Small-caps monospace label, e.g. "ACTIVE AGENTS" */
  label: string
  /** Large display number, e.g. "247" */
  value: string
  /** Optional suffix next to value, e.g. "/ DAY" */
  unit?: string
  /** Status indicator */
  status: 'online' | 'offline' | 'processing'
  /** Trend direction */
  trend?: 'up' | 'down' | 'stable'
  /** Trend delta text, e.g. "+12%" */
  trendValue?: string
  /** Accent colour override (defaults to brand) */
  accentColor?: string
}

export interface WaveformCardProps {
  /** Card title, e.g. "VOICE AI AGENT" */
  title: string
  /** Normalised bar heights 0-1 */
  bars: number[]
  /** Whether the waveform is actively animating */
  active?: boolean
  /** Status label, e.g. "LISTENING" | "SPEAKING" */
  label?: string
  /** Accent colour override */
  accentColor?: string
}

export interface ProgressRingProps {
  /** Percentage 0-100 */
  value: number
  /** Label below the ring */
  label: string
  /** Value shown inside the ring */
  sublabel?: string
  /** Ring size preset */
  size?: 'sm' | 'md' | 'lg'
  /** Accent colour override */
  accentColor?: string
}

export interface FlowDiagramNode {
  /** Node label, e.g. "LEAD" */
  label: string
  /** Optional emoji icon */
  icon?: string
  /** Whether this node is currently active */
  active?: boolean
}

export interface FlowDiagramProps {
  /** Diagram title */
  title: string
  /** Ordered pipeline nodes */
  nodes: FlowDiagramNode[]
  /** Accent colour override */
  accentColor?: string
}

export interface StatStackStat {
  /** Metric label */
  label: string
  /** Display value */
  value: string
  /** Optional normalised bar 0-1 */
  bar?: number
}

export interface StatStackProps {
  /** Section title */
  title: string
  /** Ordered stats */
  stats: StatStackStat[]
  /** Accent colour override */
  accentColor?: string
}

export interface CategoryRevealProps {
  /** Large category name */
  category: string
  /** Tagline beneath */
  tagline: string
  /** Accent colour override */
  accentColor?: string
}
