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

/* ------------------------------------------------------------------ */
/*  shadcn + lucide block system — JSON-serializable props             */
/*                                                                      */
/*  Inner content is composed from shadcn/ui primitives + lucide icons. */
/*  Motion stays Remotion frame-clock driven (spring/interpolate); the  */
/*  shadcn hover/transition utilities are inert in a rendered frame.    */
/*  Lucide icons are passed by PascalCase name string and resolved via  */
/*  the IconRow `resolveIcon` pattern.                                  */
/* ------------------------------------------------------------------ */

export interface NumberedListItem {
  /** Bold row title. */
  text: string
  /** Optional supporting line under the title. */
  detail?: string
}

export interface NumberedListProps {
  skinId: SkinId
  kicker: string
  heading: string
  items: NumberedListItem[]
  accentColor?: string
}

export interface ChecklistItem {
  /** Row label. */
  text: string
  /** Whether the row is ticked (accent Check) or pending (dim Circle). */
  done?: boolean
}

export interface ChecklistProps {
  skinId: SkinId
  kicker: string
  heading: string
  items: ChecklistItem[]
  accentColor?: string
}

export interface StatHeroProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** Target number the display counts up to. */
  value: number
  /** Decimal places to render while counting (default 0). */
  decimals?: number
  /** Prefix glued to the number, e.g. "$". */
  prefix?: string
  /** Suffix glued to the number, e.g. "%" or "K". */
  suffix?: string
  /** Caption under the number. */
  label: string
  /** Trend direction — picks the lucide icon + tint on the delta Badge. */
  trend?: 'up' | 'down'
  /** Delta text shown in the Badge, e.g. "+18% YoY". */
  delta?: string
  accentColor?: string
}

export interface ProgressBar {
  /** Row label. */
  label: string
  /** Normalised fill 0-1 (relative to the track). */
  value: number
  /** Display value drawn at the row end, e.g. "82%". */
  valueLabel: string
}

export interface ProgressBarsProps {
  skinId: SkinId
  kicker: string
  heading: string
  bars: ProgressBar[]
  accentColor?: string
}

export interface FeatureGridItem {
  /** Lucide icon name (PascalCase), e.g. "Zap". */
  icon: string
  /** Card title. */
  title: string
  /** Card description body. */
  description: string
}

export interface FeatureGridProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** Up to four feature cards laid out 2×2. */
  items: FeatureGridItem[]
  accentColor?: string
}

export interface ComparisonTableProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** Left (positive) column heading. */
  leftTitle: string
  /** Right (negative) column heading. */
  rightTitle: string
  /** Left column rows — marked with a lucide Check. */
  leftItems: string[]
  /** Right column rows — marked with a lucide X. */
  rightItems: string[]
  accentColor?: string
}

export interface KpiTickerItem {
  /** Big display value, e.g. "4.8K". */
  value: string
  /** Label under the value. */
  label: string
  /** Delta text for the Badge, e.g. "+12%". */
  delta?: string
  /** Trend direction — picks the lucide icon + Badge tint + dot color. */
  trend?: 'up' | 'down'
}

export interface KpiTickerProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** Row of stat tiles (3-4 reads best). */
  items: KpiTickerItem[]
  accentColor?: string
}

export interface QuoteCardProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** The pull quote body. */
  quote: string
  /** Attribution name. */
  name: string
  /** Attribution role / company. */
  role?: string
  /** Optional avatar image URL; falls back to initials. */
  avatarUrl?: string
  accentColor?: string
}

export interface TweetCardProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** Display name. */
  name: string
  /** @handle (without the leading @). */
  handle: string
  /** Whether to draw the lucide BadgeCheck verified mark. */
  verified?: boolean
  /** Optional avatar image URL; falls back to initials. */
  avatarUrl?: string
  /** Post body. */
  body: string
  /** Reply count label, e.g. "312". */
  replies?: string
  /** Repost count label. */
  reposts?: string
  /** Like count label. */
  likes?: string
  accentColor?: string
}

export interface DefinitionCardProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** The term being defined. */
  term: string
  /** Part of speech / phonetic, shown in a Badge. */
  partOfSpeech?: string
  /** Definition body. */
  definition: string
  accentColor?: string
}

export interface TimelineCardStep {
  /** Lucide icon name (PascalCase) for the step. */
  icon: string
  /** Step title. */
  title: string
  /** Optional supporting line. */
  detail?: string
}

export interface TimelineCardsProps {
  skinId: SkinId
  kicker: string
  heading: string
  steps: TimelineCardStep[]
  accentColor?: string
}

export interface IconStatGridItem {
  /** Lucide icon name (PascalCase). */
  icon: string
  /** Big display number, e.g. "3.4x". */
  value: string
  /** Caption under the number. */
  label: string
}

export interface IconStatGridProps {
  skinId: SkinId
  kicker: string
  heading: string
  /** Up to four icon+number tiles laid out 2×2. */
  items: IconStatGridItem[]
  accentColor?: string
}
