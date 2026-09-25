import type { Palette } from '@shared/palettes';
import type { ComparisonPositiveSide, LongformSkinId as SkinId } from '@shared/types';

/* ------------------------------------------------------------------ */
/*  Block prop interfaces — Westworld/Delos data card system            */
/* ------------------------------------------------------------------ */

export interface TimelineStep {
  /** Bold step title. */
  title: string;
  /** Optional supporting line. */
  detail?: string;
}

export interface TimelineProps {
  /** Which visual skin to render in. */
  skinId: SkinId;
  kicker: string;
  heading: string;
  steps: TimelineStep[];
  accentColor?: string;
  palette?: Palette;
}

export interface DataCardProps {
  /** Small-caps monospace label, e.g. "ACTIVE AGENTS" */
  label: string;
  /** Large display number, e.g. "247" */
  value: string;
  /** Optional suffix next to value, e.g. "/ DAY" */
  unit?: string;
  /** Status indicator */
  status: 'online' | 'offline' | 'processing';
  /** Trend direction */
  trend?: 'up' | 'down' | 'stable';
  /** Trend delta text, e.g. "+12%" */
  trendValue?: string;
  /** Accent colour override (defaults to brand) */
  accentColor?: string;
}

export interface WaveformCardProps {
  /** Card title, e.g. "VOICE AI AGENT" */
  title: string;
  /** Normalised bar heights 0-1 */
  bars: number[];
  /** Whether the waveform is actively animating */
  active?: boolean;
  /** Status label, e.g. "LISTENING" | "SPEAKING" */
  label?: string;
  /** Accent colour override */
  accentColor?: string;
}

export interface ProgressRingProps {
  /** Percentage 0-100 */
  value: number;
  /** Label below the ring */
  label: string;
  /** Value shown inside the ring */
  sublabel?: string;
  /** Ring size preset */
  size?: 'sm' | 'md' | 'lg';
  /** Accent colour override */
  accentColor?: string;
}

export interface FlowDiagramNode {
  /** Node label, e.g. "LEAD" */
  label: string;
  /** Optional emoji icon */
  icon?: string;
  /** Whether this node is currently active */
  active?: boolean;
}

export interface FlowDiagramProps {
  /** Diagram title */
  title: string;
  /** Ordered pipeline nodes */
  nodes: FlowDiagramNode[];
  /** Accent colour override */
  accentColor?: string;
}

export interface StatStackStat {
  /** Metric label */
  label: string;
  /** Display value */
  value: string;
  /** Optional normalised bar 0-1 */
  bar?: number;
}

export interface StatStackProps {
  /** Section title */
  title: string;
  /** Ordered stats */
  stats: StatStackStat[];
  /** Accent colour override */
  accentColor?: string;
}

export interface CategoryRevealProps {
  /** Large category name */
  category: string;
  /** Tagline beneath */
  tagline: string;
  /** Accent colour override */
  accentColor?: string;
}

/* ------------------------------------------------------------------ */
/*  Skin × block system — JSON-serializable props (skinId string)       */
/* ------------------------------------------------------------------ */

export interface BarChartBar {
  /** Category label under the bar. */
  label: string;
  /** Normalised height 0-1 (relative to the tallest bar). */
  value: number;
  /** Display value drawn above the bar, e.g. "$84K". */
  valueLabel: string;
}

export interface BarChartProps {
  /** Which visual skin to render in. */
  skinId: SkinId;
  kicker: string;
  heading: string;
  bars: BarChartBar[];
  accentColor?: string;
  palette?: Palette;
}

export interface ComparisonProps {
  /** Which visual skin to render in. */
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Left column heading. */
  leftTitle: string;
  /** Right column heading. */
  rightTitle: string;
  /** Left column rows. */
  leftItems: string[];
  /** Right column rows. */
  rightItems: string[];
  /** Column marked with checks and positive emphasis. Defaults to left for legacy callers. */
  positiveSide?: ComparisonPositiveSide;
  accentColor?: string;
  palette?: Palette;
}

export interface StatGridStat {
  /** Big display number, e.g. "3.4x". */
  value: string;
  /** Caption under the number. */
  label: string;
}

export interface StatGridProps {
  /** Which visual skin to render in. */
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Four metrics laid out 2×2. */
  stats: StatGridStat[];
  accentColor?: string;
  palette?: Palette;
}

export interface IconRowItem {
  /** Lucide icon name shown in the tile, e.g. "Target" (PascalCase). */
  icon: string;
  /** Label under the icon. */
  label: string;
}

export interface IconRowProps {
  /** Which visual skin to render in. */
  skinId: SkinId;
  kicker: string;
  heading: string;
  items: IconRowItem[];
  accentColor?: string;
  palette?: Palette;
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
  text: string;
  /** Optional supporting line under the title. */
  detail?: string;
}

export interface NumberedListProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  items: NumberedListItem[];
  accentColor?: string;
  palette?: Palette;
}

export interface ChecklistItem {
  /** Row label. */
  text: string;
  /** Whether the row is ticked (accent Check) or pending (dim Circle). */
  done?: boolean;
}

export interface ChecklistProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  items: ChecklistItem[];
  accentColor?: string;
  palette?: Palette;
}

export interface StatHeroProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Target number the display counts up to. */
  value: number;
  /** Decimal places to render while counting (default 0). */
  decimals?: number;
  /** Prefix glued to the number, e.g. "$". */
  prefix?: string;
  /** Suffix glued to the number, e.g. "%" or "K". */
  suffix?: string;
  /** Caption under the number. */
  label: string;
  /** Trend direction — picks the lucide icon + tint on the delta Badge. */
  trend?: 'up' | 'down';
  /** Delta text shown in the Badge, e.g. "+18% YoY". */
  delta?: string;
  accentColor?: string;
  palette?: Palette;
}

export interface ProgressBar {
  /** Row label. */
  label: string;
  /** Normalised fill 0-1 (relative to the track). */
  value: number;
  /** Display value drawn at the row end, e.g. "82%". */
  valueLabel: string;
}

export interface ProgressBarsProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  bars: ProgressBar[];
  accentColor?: string;
  palette?: Palette;
}

export interface FeatureGridItem {
  /** Lucide icon name (PascalCase), e.g. "Zap". */
  icon: string;
  /** Card title. */
  title: string;
  /** Card description body. */
  description: string;
}

export interface FeatureGridProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Up to four feature cards laid out 2×2. */
  items: FeatureGridItem[];
  accentColor?: string;
  palette?: Palette;
}

export interface ComparisonTableProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Left column heading. */
  leftTitle: string;
  /** Right column heading. */
  rightTitle: string;
  /** Left column rows. */
  leftItems: string[];
  /** Right column rows. */
  rightItems: string[];
  /** Column marked with checks and positive emphasis. Defaults to left for legacy callers. */
  positiveSide?: ComparisonPositiveSide;
  accentColor?: string;
  palette?: Palette;
}

export interface KpiTickerItem {
  /** Big display value, e.g. "4.8K". */
  value: string;
  /** Label under the value. */
  label: string;
  /** Delta text for the Badge, e.g. "+12%". */
  delta?: string;
  /** Trend direction — picks the lucide icon + Badge tint + dot color. */
  trend?: 'up' | 'down';
}

export interface KpiTickerProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Row of stat tiles (3-4 reads best). */
  items: KpiTickerItem[];
  accentColor?: string;
  palette?: Palette;
}

export interface QuoteCardProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** The pull quote body. */
  quote: string;
  /** Attribution name. */
  name: string;
  /** Attribution role / company. */
  role?: string;
  /** Optional avatar image URL; falls back to initials. */
  avatarUrl?: string;
  accentColor?: string;
  palette?: Palette;
}

export interface PortraitQuoteProps {
  skinId: SkinId;
  kicker: string;
  /** Optional small heading above the quote. */
  heading?: string;
  /** The pull quote body — AI-generated, may be long (sized responsively). */
  quote: string;
  /** Name of the person quoted. */
  name: string;
  /** Role / company shown under the name. */
  role?: string;
  /**
   * Optional portrait image. Either an http(s) URL, an absolute filesystem
   * path, or a staticFile()-resolvable relative path. Falls back to large
   * initials when absent (mirrors QuoteCard's avatar handling).
   *
   * TODO: wire a real fetched portrait through the render layer the way the
   * `split-image` archetype threads `imagePath` (see registry.ts `needsImage`
   * and FullscreenQuotePlusBroll's `resolvedImage` flow). For now the initials
   * fallback ships; no image-fetch pipeline is built.
   */
  imageUrl?: string;
  accentColor?: string;
  palette?: Palette;
}

export interface TweetCardProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Display name. */
  name: string;
  /** @handle (without the leading @). */
  handle: string;
  /** Whether to draw the lucide BadgeCheck verified mark. */
  verified?: boolean;
  /** Optional avatar image URL; falls back to initials. */
  avatarUrl?: string;
  /** Post body. */
  body: string;
  /** Reply count label, e.g. "312". */
  replies?: string;
  /** Repost count label. */
  reposts?: string;
  /** Like count label. */
  likes?: string;
  accentColor?: string;
  palette?: Palette;
}

export interface DefinitionCardProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** The term being defined. */
  term: string;
  /** Part of speech / phonetic, shown in a Badge. */
  partOfSpeech?: string;
  /** Definition body. */
  definition: string;
  accentColor?: string;
  palette?: Palette;
}

export interface CalloutProps {
  skinId: SkinId;
  /** Small top label (kept as the only chrome above the hero sentence). */
  kicker: string;
  /** Optional heading — usually unused; `body` is the hero. */
  heading?: string;
  /** The single high-impact sentence shown huge and centered. */
  body: string;
  /** Optional source / attribution line shown below the body. */
  attribution?: string;
  accentColor?: string;
  palette?: Palette;
}

export interface TimelineCardStep {
  /** Lucide icon name (PascalCase) for the step. */
  icon: string;
  /** Step title. */
  title: string;
  /** Optional supporting line. */
  detail?: string;
}

export interface TimelineCardsProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  steps: TimelineCardStep[];
  accentColor?: string;
  palette?: Palette;
}

export interface IconStatGridItem {
  /** Lucide icon name (PascalCase). */
  icon: string;
  /** Big display number, e.g. "3.4x". */
  value: string;
  /** Caption under the number. */
  label: string;
}

export interface IconStatGridProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Up to four icon+number tiles laid out 2×2. */
  items: IconStatGridItem[];
  accentColor?: string;
  palette?: Palette;
}

export interface LeaderboardRow {
  /** Explicit rank number; falls back to row order (1-based) when omitted. */
  rank?: number;
  /** Row label, e.g. a channel / product name. */
  label: string;
  /** Display value drawn at the row end, e.g. "$4.2M". */
  value: string;
}

export interface LeaderboardProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** Ranked rows (3-5 reads best). */
  rows: LeaderboardRow[];
  accentColor?: string;
  palette?: Palette;
}

export interface DonutSlice {
  /** Slice label shown in the legend. */
  label: string;
  /** Normalised share 0-1 (slices should sum to ~1). */
  value: number;
  /** Display value drawn in the legend, e.g. "42%". */
  valueLabel: string;
}

export interface DonutProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** 2-4 proportional slices forming the ring. */
  slices: DonutSlice[];
  accentColor?: string;
  palette?: Palette;
}

export interface FunnelStage {
  /** Stage label, e.g. "Visitors". */
  label: string;
  /** Normalised width 0-1 — drives how wide the stage renders (narrowing). */
  value: number;
  /** Display value drawn on the stage, e.g. "12,400" or "100%". */
  valueLabel: string;
}

export interface FunnelProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** 3-5 stacked stages that narrow downward; value drives each stage width. */
  stages: FunnelStage[];
  accentColor?: string;
  palette?: Palette;
}

export interface MapPin {
  /** Place label shown beside the pin, e.g. "London". */
  label: string;
  /** Normalised horizontal position 0-1 across the map (0 = left edge). */
  x: number;
  /** Normalised vertical position 0-1 down the map (0 = top edge). */
  y: number;
  /** Optional secondary line under the label, e.g. "12K users". */
  valueLabel?: string;
}

export interface MapBlockProps {
  skinId: SkinId;
  kicker: string;
  heading: string;
  /** 1-6 highlighted locations placed by normalized x/y (NOT lat/long). */
  pins: MapPin[];
  accentColor?: string;
  palette?: Palette;
}
