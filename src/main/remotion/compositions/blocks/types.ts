import type { SkinId } from '../../shared/skins'

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

/* ------------------------------------------------------------------ */
/*  Skin × block system — JSON-serializable props (skinId string)       */
/* ------------------------------------------------------------------ */

export interface BarChartBar {
  /** Category label under the bar. */
  label: string
  /** Normalised height 0-1 (relative to the tallest bar). */
  value: number
  /** Display value drawn above the bar, e.g. "$84K". */
  valueLabel: string
}

export interface BarChartProps {
  /** Which visual skin to render in. */
  skinId: SkinId
  kicker: string
  heading: string
  bars: BarChartBar[]
  accentColor?: string
}

export interface ComparisonProps {
  /** Which visual skin to render in. */
  skinId: SkinId
  kicker: string
  heading: string
  /** Left (positive) column heading. */
  leftTitle: string
  /** Right (negative) column heading. */
  rightTitle: string
  /** Left column rows — marked with a ✓. */
  leftItems: string[]
  /** Right column rows — marked with a ✕. */
  rightItems: string[]
  accentColor?: string
}

export interface StatGridStat {
  /** Big display number, e.g. "3.4x". */
  value: string
  /** Caption under the number. */
  label: string
}

export interface StatGridProps {
  /** Which visual skin to render in. */
  skinId: SkinId
  kicker: string
  heading: string
  /** Four metrics laid out 2×2. */
  stats: StatGridStat[]
  accentColor?: string
}

export interface IconRowItem {
  /** Lucide icon name shown in the tile, e.g. "Target" (PascalCase). */
  icon: string
  /** Label under the icon. */
  label: string
}

export interface IconRowProps {
  /** Which visual skin to render in. */
  skinId: SkinId
  kicker: string
  heading: string
  items: IconRowItem[]
  accentColor?: string
}
