import React from 'react'
import { Composition } from 'remotion'
import { FullscreenQuote, type FullscreenQuoteProps } from './compositions/FullscreenQuote'
import {
  FullscreenQuotePlusBroll,
  type FullscreenQuotePlusBrollProps
} from './compositions/FullscreenQuotePlusBroll'
import {
  DataCard,
  WaveformCard,
  ProgressRing,
  FlowDiagram,
  StatStack,
  CategoryReveal
} from './compositions/blocks'
import type {
  DataCardProps,
  WaveformCardProps,
  ProgressRingProps,
  FlowDiagramProps,
  StatStackProps,
  CategoryRevealProps
} from './compositions/blocks'
import { PhraseOverlay, type PhraseOverlayProps } from './compositions/PhraseOverlay'
import { SectionHeader, type SectionHeaderProps } from './compositions/SectionHeader'
import { ConceptCard, type ConceptCardProps } from './compositions/ConceptCard'
import {
  BakeoffAuroraGlass,
  BakeoffEditorial,
  BakeoffBento,
  BakeoffTerminal,
  type BakeoffProps
} from './compositions/_bakeoff'
import { Timeline, type TimelineProps } from './compositions/blocks/Timeline'
import { SKINS, type SkinId } from './shared/skins'
import { BRAND_ACCENT, BRAND_FG } from '../edit-styles/shared/brand'

// Locked 9:16 vertical canvas — must match OUTPUT_WIDTH/HEIGHT/FPS in src/main/aspect-ratios.ts.
const VERTICAL_WIDTH = 1080
const VERTICAL_HEIGHT = 1920
const FPS = 30

// Long-form 16:9 landscape canvas — must match LANDSCAPE_WIDTH/HEIGHT/FPS in
// src/main/aspect-ratios.ts. Used only by the Hormozi long-form compositions.
const LANDSCAPE_WIDTH = 1920
const LANDSCAPE_HEIGHT = 1080

const PRESTYJ_DEFAULTS = {
  accentColor: BRAND_ACCENT,
  primaryColor: BRAND_FG,
  bodyFont: 'Geist',
  scriptFont: 'Style Script'
} as const

// FullscreenQuote uses Instrument Serif Italic on a sand backdrop — it's
// the hero archetype where the quote *is* the entire frame, so it gets its
// own type system (a dark-brown serif italic that reads like print) rather
// than the body Geist used by the speaker archetypes. Inverts the brand
// palette so a quote moment doesn't feel like the video cut to black.
const PRESTYJ_QUOTE_DEFAULTS = {
  ...PRESTYJ_DEFAULTS,
  bodyFont: 'Instrument Serif'
} as const

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FullscreenQuote"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FullscreenQuote as any}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          quote: 'You don\u2019t need permission to start. You need a deadline.',
          attribution: 'PRESTYJ',
          ...PRESTYJ_QUOTE_DEFAULTS
        } satisfies FullscreenQuoteProps}
      />

      <Composition
        id="FullscreenQuotePlusBroll"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FullscreenQuotePlusBroll as any}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          quote: 'The compounding effect is invisible until it is undeniable.',
          attribution: 'PRESTYJ',
          // Studio sample image; production callers pass an absolute path or
          // a staticFile() URL.
          imagePath: '',
          ...PRESTYJ_DEFAULTS
        } satisfies FullscreenQuotePlusBrollProps}
      />

      {/* ---- Westworld/Delos Block Library ---- */}

      <Composition
        id="BlockDataCard"
        component={DataCard as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          label: 'ACTIVE AGENTS',
          value: '247',
          unit: '/ DAY',
          status: 'online',
          trend: 'up',
          trendValue: '+12%'
        } satisfies DataCardProps}
      />

      <Composition
        id="BlockWaveform"
        component={WaveformCard as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: 'VOICE AI AGENT',
          bars: [0.2, 0.5, 0.8, 0.3, 0.9, 0.4, 0.7, 0.6, 0.85, 0.35, 0.65, 0.5, 0.75, 0.45, 0.55, 0.8, 0.3, 0.6, 0.7, 0.4],
          active: true,
          label: 'SPEAKING'
        } satisfies WaveformCardProps}
      />

      <Composition
        id="BlockProgressRing"
        component={ProgressRing as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          value: 97,
          label: 'UPTIME',
          sublabel: '99.97%',
          size: 'lg'
        } satisfies ProgressRingProps}
      />

      <Composition
        id="BlockFlowDiagram"
        component={FlowDiagram as any}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: 'SALES AUTOMATION PIPELINE',
          nodes: [
            { label: 'LEAD', icon: '🎯', active: false },
            { label: 'QUALIFY', icon: '🔍', active: false },
            { label: 'NURTURE', icon: '🤖', active: true },
            { label: 'CLOSE', icon: '💰', active: false }
          ]
        } satisfies FlowDiagramProps}
      />

      <Composition
        id="BlockStatStack"
        component={StatStack as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          title: 'PERFORMANCE METRICS',
          stats: [
            { label: 'RESPONSE TIME', value: '<200ms', bar: 0.92 },
            { label: 'ACCURACY', value: '98.4%', bar: 0.98 },
            { label: 'TASKS / HOUR', value: '1,247', bar: 0.78 },
            { label: 'SATISFACTION', value: '4.9/5', bar: 0.98 }
          ]
        } satisfies StatStackProps}
      />

      <Composition
        id="BlockCategoryReveal"
        component={CategoryReveal as any}
        durationInFrames={FPS * 3}
        fps={FPS}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        defaultProps={{
          category: 'AI OPERATING SYSTEM',
          tagline: 'Your business, on autopilot'
        } satisfies CategoryRevealProps}
      />

      {/* ---- Hormozi Long-Form (16:9) ---- */}

      <Composition
        id="HormoziPhraseOverlay"
        component={PhraseOverlay as any}
        durationInFrames={FPS * 3}
        fps={FPS}
        width={LANDSCAPE_WIDTH}
        height={LANDSCAPE_HEIGHT}
        defaultProps={{
          text: 'FIRST $100,000',
          accentColor: '#FFD600',
          fontSize: 150,
          animationType: 'scale-in'
        } satisfies PhraseOverlayProps}
      />

      <Composition
        id="HormoziSectionHeader"
        component={SectionHeader as any}
        durationInFrames={FPS * 3}
        fps={FPS}
        width={LANDSCAPE_WIDTH}
        height={LANDSCAPE_HEIGHT}
        defaultProps={{
          text: 'The Real Problem',
          iconEmoji: '🎯',
          accentColor: '#9F75FF',
          backgroundColor: '#1A1A2E'
        } satisfies SectionHeaderProps}
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
          defaultProps={{
            skinId,
            kicker: 'THE PLAYBOOK',
            heading: 'From Idea To First Sale',
            steps: [
              { title: 'Validate the pain', detail: 'Ten conversations before one line of code' },
              { title: 'Sell before you build', detail: 'A waitlist is a vote with intent' },
              { title: 'Ship the ugly version', detail: 'Embarrassment is cheaper than silence' }
            ],
            accentColor: BRAND_ACCENT
          } satisfies TimelineProps}
        />
      ))}

      {/* ---- SCRATCH: bullet-card bake-off (delete after pick) ---- */}
      {([
        ['BakeAuroraGlass', BakeoffAuroraGlass],
        ['BakeEditorial', BakeoffEditorial],
        ['BakeBento', BakeoffBento],
        ['BakeTerminal', BakeoffTerminal]
      ] as const).map(([id, Comp]) => (
        <Composition
          key={id}
          id={id}
          component={Comp as any}
          durationInFrames={FPS * 4}
          fps={FPS}
          width={LANDSCAPE_WIDTH}
          height={LANDSCAPE_HEIGHT}
          defaultProps={{
            kicker: 'THE FRAMEWORK',
            heading: 'Why Most Founders Stall',
            items: [
              'They optimize for applause',
              'They confuse motion with progress',
              'They never raise their prices'
            ],
            accentColor: BRAND_ACCENT
          } satisfies BakeoffProps}
        />
      ))}

      <Composition
        id="HormoziConceptCard"
        component={ConceptCard as any}
        durationInFrames={FPS * 4}
        fps={FPS}
        width={LANDSCAPE_WIDTH}
        height={LANDSCAPE_HEIGHT}
        defaultProps={{
          layout: 'list',
          text: 'Three Levers',
          subtitle: '',
          items: ['More customers', 'Higher prices', 'Better retention'],
          accentColor: '#FFD600',
          backgroundColor: '#1A1A2E'
        } satisfies ConceptCardProps}
      />
    </>
  )
}
