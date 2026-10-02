import type React from 'react';
import { Composition } from 'remotion';
import { BUILTIN_PALETTES } from '../../shared/palettes';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../edit-styles/shared/brand';
import {
  BakeoffAuroraGlass,
  BakeoffBento,
  BakeoffEditorial,
  type BakeoffProps,
  BakeoffTerminal,
} from './compositions/_bakeoff';
import type {
  BarChartProps,
  CalloutProps,
  CategoryRevealProps,
  ChecklistProps,
  ComparisonProps,
  ComparisonTableProps,
  DataCardProps,
  DefinitionCardProps,
  DonutProps,
  FeatureGridProps,
  FlowDiagramProps,
  FunnelProps,
  IconRowProps,
  IconStatGridProps,
  KpiTickerProps,
  LeaderboardProps,
  MapBlockProps,
  NumberedListProps,
  PortraitQuoteProps,
  ProgressBarsProps,
  ProgressRingProps,
  QuoteCardProps,
  StatGridProps,
  StatHeroProps,
  StatStackProps,
  TimelineCardsProps,
  TweetCardProps,
  WaveformCardProps,
} from './compositions/blocks';
import {
  BarChart,
  Callout,
  CategoryReveal,
  Checklist,
  Comparison,
  ComparisonTable,
  DataCard,
  DefinitionCard,
  Donut,
  FeatureGrid,
  FlowDiagram,
  Funnel,
  IconRow,
  IconStatGrid,
  KpiTicker,
  Leaderboard,
  MapBlock,
  NumberedList,
  PortraitQuote,
  ProgressBars,
  ProgressRing,
  QuoteCard,
  StatGrid,
  StatHero,
  StatStack,
  TimelineCards,
  TweetCard,
  WaveformCard,
} from './compositions/blocks';
import { Timeline, type TimelineProps } from './compositions/blocks/Timeline';
import { DelosEvidenceCard, type DelosEvidenceCardProps } from './compositions/DelosEvidenceCard';
import { ExplainerScene } from './compositions/explainer/ExplainerScene';
import { ExplainerSequence } from './compositions/explainer/ExplainerSequence';
import { deriveExplainerPalette } from './compositions/explainer/palette';
import { QuoteGraphic } from './compositions/explainer/QuoteGraphic';
import {
  QUOTE_GRAPHIC_COMPOSITION_ID,
  QUOTE_GRAPHIC_HEIGHT,
  QUOTE_GRAPHIC_WIDTH,
  type QuoteGraphicProps,
} from './compositions/explainer/quote-graphic';
import {
  EXPLAINER_FPS,
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  type ExplainerSceneProps,
  type ExplainerSequenceProps,
} from './compositions/explainer/types';
import { FullscreenQuote, type FullscreenQuoteProps } from './compositions/FullscreenQuote';
import {
  FullscreenQuotePlusBroll,
  type FullscreenQuotePlusBrollProps,
} from './compositions/FullscreenQuotePlusBroll';
import { PhraseOverlay, type PhraseOverlayProps } from './compositions/PhraseOverlay';
import { StoryBoard } from './compositions/storyboard/StoryBoard';
import type { ProductionStoryBoardProps } from './compositions/storyboard/types';
import { SKINS, type SkinId } from './shared/skins';

// Locked 9:16 vertical canvas — must match OUTPUT_WIDTH/HEIGHT/FPS in src/main/aspect-ratios.ts.
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const FPS = 30;

// Long-form 16:9 landscape canvas — must match LANDSCAPE_WIDTH/HEIGHT/FPS in
// src/main/aspect-ratios.ts. Used only by the Hormozi long-form compositions.
const LANDSCAPE_WIDTH = 1920;
const LANDSCAPE_HEIGHT = 1080;

const PRESTYJ_DEFAULTS = {
  accentColor: BRAND_ACCENT,
  primaryColor: BRAND_FG,
  bodyFont: 'Geist',
  scriptFont: 'Style Script',
} as const;

// FullscreenQuote uses Instrument Serif Italic on a sand backdrop — it's
// the hero archetype where the quote *is* the entire frame, so it gets its
// own type system (a dark-brown serif italic that reads like print) rather
// than the body Geist used by the speaker archetypes. Inverts the brand
// palette so a quote moment doesn't feel like the video cut to black.
const PRESTYJ_QUOTE_DEFAULTS = {
  ...PRESTYJ_DEFAULTS,
  bodyFont: 'Instrument Serif',
} as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Production-only inputs: no proof fixtures or source media in this bundle. */}
      <Composition
        id="StoryBoard"
        component={StoryBoard}
        durationInFrames={1}
        fps={FPS}
        width={LANDSCAPE_WIDTH}
        height={LANDSCAPE_HEIGHT}
        defaultProps={
          {
            style: 'polish',
            palette: BUILTIN_PALETTES[0],
            spec: {
              durationSec: 1 / FPS,
              boardIn: { at: 0, dur: 0 },
              boardOut: { at: 0, dur: 0 },
              shots: [{ at: 0, dur: 0, x: 0, y: 0, zoom: 1 }],
              elements: [],
              props: [],
            },
          } satisfies ProductionStoryBoardProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, Math.ceil(props.spec.durationSec * FPS - 1e-6)),
        })}
      />
      {/* Explainer stage: top half of a split short. Opaque, 1080×960. */}
      <Composition
        id="ExplainerScene"
        component={ExplainerScene as any}
        durationInFrames={EXPLAINER_FPS * 6}
        fps={EXPLAINER_FPS}
        width={EXPLAINER_STAGE_WIDTH}
        height={EXPLAINER_STAGE_HEIGHT}
        defaultProps={
          {
            accentColor: BRAND_ACCENT,
            scene: {
              kind: 'flow',
              inputLabel: 'Prompt',
              inputText: 'Closed deal',
              engineLabel: 'AI',
              outputLabel: 'Answer',
              outputText: 'Delivery plan',
              inputAt: 0.6,
              outputAt: 2.4,
            },
          } satisfies ExplainerSceneProps
        }
      />

      {/* Explainer sequence: chained scenes, any layout. Size/duration set per render. */}
      <Composition
        id="ExplainerSequence"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={ExplainerSequence as any}
        durationInFrames={EXPLAINER_FPS * 9}
        fps={EXPLAINER_FPS}
        width={EXPLAINER_STAGE_WIDTH}
        height={EXPLAINER_STAGE_HEIGHT}
        defaultProps={
          {
            layout: 'stack',
            aspect: '9:16',
            palette: deriveExplainerPalette(),
            enter: true,
            exit: true,
            transitions: [{ kind: 'grow', durationInFrames: 14 }],
            scenes: [
              {
                durationInFrames: EXPLAINER_FPS * 4,
                scene: {
                  kind: 'checklist',
                  title: 'Human calls',
                  items: [
                    { label: 'Commitments', icon: 'Handshake', doneAt: 0.8 },
                    { label: 'Unusual asks', icon: 'MessageSquare', doneAt: 1.6 },
                    { label: 'Client relationships', icon: 'Users', doneAt: 2.4 },
                  ],
                  pulses: [{ at: 2.9, target: 2, strength: 'pulse' }],
                },
              },
              {
                durationInFrames: EXPLAINER_FPS * 5,
                scene: {
                  kind: 'flow',
                  inputLabel: 'Prompt',
                  inputText: 'Closed deal',
                  engineLabel: 'AI',
                  outputLabel: 'Answer',
                  outputText: 'Delivery plan',
                  inputAt: 0.6,
                  outputAt: 2.2,
                  overlayStamp: { word: 'Yes, but', at: 3.4 },
                },
              },
            ],
          } satisfies ExplainerSequenceProps
        }
      />

      {/* Fullscreen-quote card backdrop + animated prop. Duration set per render. */}
      <Composition
        id={QUOTE_GRAPHIC_COMPOSITION_ID}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={QuoteGraphic as any}
        durationInFrames={EXPLAINER_FPS * 4}
        fps={EXPLAINER_FPS}
        width={QUOTE_GRAPHIC_WIDTH}
        height={QUOTE_GRAPHIC_HEIGHT}
        defaultProps={
          {
            prop: 'lightbulb',
            at: 0.3,
            background: BRAND_FG,
            seedBackground: BRAND_BG,
            seedForeground: BRAND_FG,
            accent: BRAND_ACCENT,
          } satisfies QuoteGraphicProps
        }
      />

      <Composition
        id="FullscreenQuote"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FullscreenQuote as any}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            quote: 'You don\u2019t need permission to start. You need a deadline.',
            attribution: 'PRESTYJ',
            ...PRESTYJ_QUOTE_DEFAULTS,
          } satisfies FullscreenQuoteProps
        }
      />

      <Composition
        id="FullscreenQuotePlusBroll"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FullscreenQuotePlusBroll as any}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            quote: 'The compounding effect is invisible until it is undeniable.',
            attribution: 'PRESTYJ',
            // Studio sample image; production callers pass an absolute path or
            // a staticFile() URL.
            imagePath: '',
            ...PRESTYJ_DEFAULTS,
          } satisfies FullscreenQuotePlusBrollProps
        }
      />

      {/* ---- Westworld/Delos Block Library ---- */}

      <Composition
        id="BlockDataCard"
        component={DataCard as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            label: 'ACTIVE AGENTS',
            value: '247',
            unit: '/ DAY',
            status: 'online',
            trend: 'up',
            trendValue: '+12%',
          } satisfies DataCardProps
        }
      />

      <Composition
        id="BlockWaveform"
        component={WaveformCard as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            title: 'VOICE AI AGENT',
            bars: [
              0.2, 0.5, 0.8, 0.3, 0.9, 0.4, 0.7, 0.6, 0.85, 0.35, 0.65, 0.5, 0.75, 0.45, 0.55, 0.8,
              0.3, 0.6, 0.7, 0.4,
            ],
            active: true,
            label: 'SPEAKING',
          } satisfies WaveformCardProps
        }
      />

      <Composition
        id="BlockProgressRing"
        component={ProgressRing as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            value: 97,
            label: 'UPTIME',
            sublabel: '99.97%',
            size: 'lg',
          } satisfies ProgressRingProps
        }
      />

      <Composition
        id="BlockFlowDiagram"
        component={FlowDiagram as any}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            title: 'SALES AUTOMATION PIPELINE',
            nodes: [
              { label: 'LEAD', icon: '🎯', active: false },
              { label: 'QUALIFY', icon: '🔍', active: false },
              { label: 'NURTURE', icon: '🤖', active: true },
              { label: 'CLOSE', icon: '💰', active: false },
            ],
          } satisfies FlowDiagramProps
        }
      />

      <Composition
        id="BlockStatStack"
        component={StatStack as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            title: 'PERFORMANCE METRICS',
            stats: [
              { label: 'RESPONSE TIME', value: '<200ms', bar: 0.92 },
              { label: 'ACCURACY', value: '98.4%', bar: 0.98 },
              { label: 'TASKS / HOUR', value: '1,247', bar: 0.78 },
              { label: 'SATISFACTION', value: '4.9/5', bar: 0.98 },
            ],
          } satisfies StatStackProps
        }
      />

      <Composition
        id="BlockCategoryReveal"
        component={CategoryReveal as any}
        durationInFrames={FPS * 3}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={
          {
            category: 'AI OPERATING SYSTEM',
            tagline: 'Your business, on autopilot',
          } satisfies CategoryRevealProps
        }
      />

      {/* ---- Hormozi Long-Form (16:9) ---- */}

      <Composition
        id="HormoziPhraseOverlay"
        component={PhraseOverlay as any}
        durationInFrames={FPS * 3}
        fps={FPS}
        width={LANDSCAPE_WIDTH}
        height={LANDSCAPE_HEIGHT}
        defaultProps={
          {
            text: 'FIRST $100,000',
            accentColor: BRAND_FG,
            fontSize: 150,
            animationType: 'scale-in',
          } satisfies PhraseOverlayProps
        }
      />

      <Composition
        id="DelosEvidenceCard"
        component={DelosEvidenceCard as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={LANDSCAPE_WIDTH}
        height={LANDSCAPE_HEIGHT}
        defaultProps={
          {
            kind: 'delos-console',
            title: 'Revenue momentum',
            statusText: 'VERIFIED',
            metrics: [
              { label: 'Growth', value: '+42%' },
              { label: 'Retention', value: '96%' },
              { label: 'Runway', value: '18 mo' },
            ],
            accentColor: BRAND_ACCENT,
          } satisfies DelosEvidenceCardProps
        }
      />

      {/* ---- Timeline block × every skin (matrix proof) ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Timeline-${skinId}`}
          id={`Timeline-${skinId}`}
          component={Timeline as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE PLAYBOOK',
              heading: 'From Idea To First Sale',
              steps: [
                { title: 'Validate the pain', detail: 'Ten conversations before one line of code' },
                { title: 'Sell before you build', detail: 'A waitlist is a vote with intent' },
                { title: 'Ship the ugly version', detail: 'Embarrassment is cheaper than silence' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies TimelineProps
          }
        />
      ))}

      {/* ---- BarChart block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`BarChart-${skinId}`}
          id={`BarChart-${skinId}`}
          component={BarChart as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE NUMBERS',
              heading: 'Revenue By Quarter',
              bars: [
                { label: 'Q1', value: 0.42, valueLabel: '$84K' },
                { label: 'Q2', value: 0.58, valueLabel: '$116K' },
                { label: 'Q3', value: 0.74, valueLabel: '$148K' },
                { label: 'Q4', value: 1.0, valueLabel: '$201K' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies BarChartProps
          }
        />
      ))}

      {/* ---- Comparison block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Comparison-${skinId}`}
          id={`Comparison-${skinId}`}
          component={Comparison as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE FORK',
              heading: 'Amateurs vs Operators',
              leftTitle: 'OPERATORS',
              rightTitle: 'AMATEURS',
              leftItems: [
                'Sell before they build',
                'Raise prices on purpose',
                'Measure what compounds',
              ],
              rightItems: ['Polish in private', 'Compete on cheap', 'Chase vanity metrics'],
              accentColor: BRAND_ACCENT,
            } satisfies ComparisonProps
          }
        />
      ))}

      {/* ---- StatGrid block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`StatGrid-${skinId}`}
          id={`StatGrid-${skinId}`}
          component={StatGrid as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'BY THE NUMBERS',
              heading: 'One Year In',
              stats: [
                { value: '3.4x', label: 'Revenue growth' },
                { value: '12K', label: 'Active customers' },
                { value: '98%', label: 'Retention rate' },
                { value: '<2h', label: 'Support response' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies StatGridProps
          }
        />
      ))}

      {/* ---- IconRow block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`IconRow-${skinId}`}
          id={`IconRow-${skinId}`}
          component={IconRow as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE STACK',
              heading: 'Built On Four Pillars',
              items: [
                { icon: 'Target', label: 'Positioning' },
                { icon: 'Zap', label: 'Velocity' },
                { icon: 'RefreshCw', label: 'Retention' },
                { icon: 'TrendingUp', label: 'Leverage' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies IconRowProps
          }
        />
      ))}

      {/* ===== shadcn + lucide block library × every skin ===== */}

      {/* ---- NumberedList block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`NumberedList-${skinId}`}
          id={`NumberedList-${skinId}`}
          component={NumberedList as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE PLAYBOOK',
              heading: 'Ship Your First Offer',
              items: [
                { text: 'Pick one painful problem', detail: 'Narrow beats clever every time' },
                {
                  text: 'Pre-sell before you build',
                  detail: 'A deposit is the only real validation',
                },
                { text: 'Deliver the ugly version', detail: 'Speed compounds, polish does not' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies NumberedListProps
          }
        />
      ))}

      {/* ---- Checklist block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Checklist-${skinId}`}
          id={`Checklist-${skinId}`}
          component={Checklist as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'LAUNCH PREP',
              heading: 'Before You Go Live',
              items: [
                { text: 'Landing page is live', done: true },
                { text: 'Payment link tested', done: true },
                { text: 'Waitlist emailed', done: true },
                { text: 'Launch thread scheduled', done: false },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies ChecklistProps
          }
        />
      ))}

      {/* ---- StatHero block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`StatHero-${skinId}`}
          id={`StatHero-${skinId}`}
          component={StatHero as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'ONE YEAR IN',
              heading: 'Annual Recurring Revenue',
              value: 1.2,
              decimals: 1,
              prefix: '$',
              suffix: 'M',
              label: 'Up from $310K last year',
              trend: 'up',
              delta: '+287% YoY',
              accentColor: BRAND_ACCENT,
            } satisfies StatHeroProps
          }
        />
      ))}

      {/* ---- ProgressBars block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`ProgressBars-${skinId}`}
          id={`ProgressBars-${skinId}`}
          component={ProgressBars as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'WHERE TIME GOES',
              heading: 'How Founders Spend The Week',
              bars: [
                { label: 'Building product', value: 0.82, valueLabel: '82%' },
                { label: 'Talking to users', value: 0.54, valueLabel: '54%' },
                { label: 'Marketing', value: 0.38, valueLabel: '38%' },
                { label: 'Admin & ops', value: 0.21, valueLabel: '21%' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies ProgressBarsProps
          }
        />
      ))}

      {/* ---- FeatureGrid block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`FeatureGrid-${skinId}`}
          id={`FeatureGrid-${skinId}`}
          component={FeatureGrid as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'WHY IT WORKS',
              heading: 'Built For Operators',
              items: [
                {
                  icon: 'Zap',
                  title: 'Fast by default',
                  description: 'Renders in seconds, not minutes',
                },
                {
                  icon: 'ShieldCheck',
                  title: 'Private',
                  description: 'Runs locally on your machine',
                },
                { icon: 'Layers', title: 'Composable', description: 'Mix blocks and skins freely' },
                {
                  icon: 'TrendingUp',
                  title: 'Proven',
                  description: 'Tested across thousands of clips',
                },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies FeatureGridProps
          }
        />
      ))}

      {/* ---- ComparisonTable block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`ComparisonTable-${skinId}`}
          id={`ComparisonTable-${skinId}`}
          component={ComparisonTable as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE FORK',
              heading: 'Operators vs Amateurs',
              leftTitle: 'OPERATORS',
              rightTitle: 'AMATEURS',
              leftItems: [
                'Sell before they build',
                'Raise prices on purpose',
                'Measure what compounds',
              ],
              rightItems: ['Polish in private', 'Compete on cheap', 'Chase vanity metrics'],
              accentColor: BRAND_ACCENT,
            } satisfies ComparisonTableProps
          }
        />
      ))}

      {/* ---- KpiTicker block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`KpiTicker-${skinId}`}
          id={`KpiTicker-${skinId}`}
          component={KpiTicker as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THIS QUARTER',
              heading: 'The Numbers That Matter',
              items: [
                { value: '4.8K', label: 'CUSTOMERS', delta: '+12%', trend: 'up' },
                { value: '98%', label: 'RETENTION', delta: '+3%', trend: 'up' },
                { value: '1.9%', label: 'CHURN', delta: '-0.4%', trend: 'down' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies KpiTickerProps
          }
        />
      ))}

      {/* ---- QuoteCard block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`QuoteCard-${skinId}`}
          id={`QuoteCard-${skinId}`}
          component={QuoteCard as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'IN THEIR WORDS',
              heading: 'What Users Say',
              quote: 'The compounding effect is invisible until it is undeniable.',
              name: 'Jordan Rivera',
              role: 'Founder, Latchkey',
              accentColor: BRAND_ACCENT,
            } satisfies QuoteCardProps
          }
        />
      ))}

      {/* ---- PortraitQuote block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`PortraitQuote-${skinId}`}
          id={`PortraitQuote-${skinId}`}
          component={PortraitQuote as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'IN THEIR WORDS',
              heading: 'Why It Matters',
              quote: 'The work that compounds is the work nobody claps for while you are doing it.',
              name: 'Jordan Rivera',
              role: 'Founder, Latchkey',
              // No imageUrl — demonstrates the large-initials fallback.
              accentColor: BRAND_ACCENT,
            } satisfies PortraitQuoteProps
          }
        />
      ))}

      {/* ---- TweetCard block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`TweetCard-${skinId}`}
          id={`TweetCard-${skinId}`}
          component={TweetCard as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE RECEIPTS',
              heading: 'It Spread On Its Own',
              name: 'Mara Chen',
              handle: 'marabuilds',
              verified: true,
              body: 'Spent the weekend rebuilding our launch video with this. Three clips, four looks each, zero After Effects. Wild.',
              replies: '312',
              reposts: '1.2K',
              likes: '8.4K',
              accentColor: BRAND_ACCENT,
            } satisfies TweetCardProps
          }
        />
      ))}

      {/* ---- DefinitionCard block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`DefinitionCard-${skinId}`}
          id={`DefinitionCard-${skinId}`}
          component={DefinitionCard as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'DEFINE IT',
              heading: 'Know The Term',
              term: 'Leverage',
              partOfSpeech: 'noun',
              definition:
                'Output that keeps producing after the work that created it is done — code, media, and brand.',
              accentColor: BRAND_ACCENT,
            } satisfies DefinitionCardProps
          }
        />
      ))}

      {/* ---- TimelineCards block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`TimelineCards-${skinId}`}
          id={`TimelineCards-${skinId}`}
          component={TimelineCards as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE ROADMAP',
              heading: 'From Zero To Launch',
              steps: [
                {
                  icon: 'Lightbulb',
                  title: 'Validate',
                  detail: 'Ten interviews before one line of code',
                },
                { icon: 'Hammer', title: 'Build', detail: 'Ship the smallest useful version' },
                { icon: 'Rocket', title: 'Launch', detail: 'Tell everyone, loudly, on one day' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies TimelineCardsProps
          }
        />
      ))}

      {/* ---- IconStatGrid block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`IconStatGrid-${skinId}`}
          id={`IconStatGrid-${skinId}`}
          component={IconStatGrid as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'BY THE NUMBERS',
              heading: 'One Year Of Growth',
              items: [
                { icon: 'Users', value: '12K', label: 'Active customers' },
                { icon: 'DollarSign', value: '3.4x', label: 'Revenue growth' },
                { icon: 'Repeat', value: '98%', label: 'Retention rate' },
                { icon: 'Clock', value: '<2h', label: 'Support response' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies IconStatGridProps
          }
        />
      ))}

      {/* ---- Leaderboard block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Leaderboard-${skinId}`}
          id={`Leaderboard-${skinId}`}
          component={Leaderboard as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE RANKINGS',
              heading: 'Top Channels By Revenue',
              rows: [
                { rank: 1, label: 'MrBeast', value: '$82M' },
                { rank: 2, label: 'Like Nastya', value: '$28M' },
                { rank: 3, label: 'Ryan\u2019s World', value: '$25M' },
                { rank: 4, label: 'Dude Perfect', value: '$20M' },
                { rank: 5, label: 'Markiplier', value: '$18M' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies LeaderboardProps
          }
        />
      ))}

      {/* ---- Donut block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Donut-${skinId}`}
          id={`Donut-${skinId}`}
          component={Donut as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'WHERE IT GOES',
              heading: 'How The Budget Splits',
              slices: [
                { label: 'Paid acquisition', value: 0.46, valueLabel: '46%' },
                { label: 'Product & R&D', value: 0.3, valueLabel: '30%' },
                { label: 'Team & ops', value: 0.16, valueLabel: '16%' },
                { label: 'Everything else', value: 0.08, valueLabel: '8%' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies DonutProps
          }
        />
      ))}

      {/* ---- Funnel block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Funnel-${skinId}`}
          id={`Funnel-${skinId}`}
          component={Funnel as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE JOURNEY',
              heading: 'From Audience To Customers',
              stages: [
                { label: 'Visitors', value: 1, valueLabel: '48,000' },
                { label: 'Leads', value: 0.62, valueLabel: '12,400' },
                { label: 'Qualified', value: 0.34, valueLabel: '3,200' },
                { label: 'Trials', value: 0.18, valueLabel: '940' },
                { label: 'Customers', value: 0.08, valueLabel: '210' },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies FunnelProps
          }
        />
      ))}

      {/* ---- Callout block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`Callout-${skinId}`}
          id={`Callout-${skinId}`}
          component={Callout as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'THE TAKEAWAY',
              body: 'You don’t get paid for the hours — you get paid for the value those hours create.',
              attribution: 'Alex Hormozi',
              accentColor: BRAND_ACCENT,
            } satisfies CalloutProps
          }
        />
      ))}

      {/* ---- MapBlock block × every skin ---- */}
      {(Object.keys(SKINS) as SkinId[]).map((skinId) => (
        <Composition
          key={`MapBlock-${skinId}`}
          id={`MapBlock-${skinId}`}
          component={MapBlock as any}
          durationInFrames={FPS * 5}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              skinId,
              kicker: 'GOING GLOBAL',
              heading: 'We Shipped To 30 Countries',
              pins: [
                { label: 'San Francisco', x: 0.12, y: 0.42, valueLabel: '4.2K users' },
                { label: 'London', x: 0.47, y: 0.34, valueLabel: '3.1K users' },
                { label: 'Lagos', x: 0.5, y: 0.6 },
                { label: 'Singapore', x: 0.76, y: 0.62, valueLabel: '2.8K users' },
                { label: 'Sydney', x: 0.84, y: 0.82 },
              ],
              accentColor: BRAND_ACCENT,
            } satisfies MapBlockProps
          }
        />
      ))}

      {/* ---- SCRATCH: bullet-card bake-off (delete after pick) ---- */}
      {(
        [
          ['BakeAuroraGlass', BakeoffAuroraGlass],
          ['BakeEditorial', BakeoffEditorial],
          ['BakeBento', BakeoffBento],
          ['BakeTerminal', BakeoffTerminal],
        ] as const
      ).map(([id, Comp]) => (
        <Composition
          key={id}
          id={id}
          component={Comp as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={
            {
              kicker: 'THE FRAMEWORK',
              heading: 'Why Most Founders Stall',
              items: [
                'They optimize for applause',
                'They confuse motion with progress',
                'They never raise their prices',
              ],
              accentColor: BRAND_ACCENT,
            } satisfies BakeoffProps
          }
        />
      ))}
    </>
  );
};
