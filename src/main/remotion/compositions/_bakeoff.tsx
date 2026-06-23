/**
 * SCRATCH — bullet-card bake-off. Four redesigns of the Hormozi ConceptCard
 * "list" layout, each a different premium design-language combo. Rendered as
 * stills for visual comparison, then the winner gets promoted into blocks/.
 * Delete this file once a direction is chosen.
 */
import React from 'react'
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  random
} from 'remotion'
import { BRAND_BG, BRAND_FG, BRAND_ACCENT } from '../../edit-styles/shared/brand'
import { EASE } from '../shared/easing'
import { PrestyjFonts } from '../shared/fonts'
import { DarkCard, AccentLine, GridOverlay, GlowDot } from '../shared/primitives'

export interface BakeoffProps {
  kicker: string
  heading: string
  items: string[]
  accentColor?: string
}

const DEMO: BakeoffProps = {
  kicker: 'THE FRAMEWORK',
  heading: 'Why Most Founders Stall',
  items: ['They optimize for applause', 'They confuse motion with progress', 'They never raise their prices'],
  accentColor: BRAND_ACCENT
}

/* ===================================================================== */
/*  Shared: drifting aurora background (Aceternity-style, frame-driven)   */
/* ===================================================================== */

const Aurora: React.FC<{ accent: string; intensity?: number }> = ({ accent, intensity = 1 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const blob = (i: number, baseX: number, baseY: number, color: string, size: number) => {
    const x = baseX + Math.sin(t * 0.25 + i) * 90
    const y = baseY + Math.cos(t * 0.2 + i * 1.7) * 70
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
          filter: 'blur(60px)',
          opacity: 0.55 * intensity
        }}
      />
    )
  }
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {blob(0, 120, 80, accent, 760)}
      {blob(1, 1180, 540, '#c9a24b', 680)}
      {blob(2, 620, 760, accent, 560)}
    </AbsoluteFill>
  )
}

const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.06 }) => {
  const dots = Array.from({ length: 220 }, (_, i) => {
    const x = random(`gx${i}`) * 1920
    const y = random(`gy${i}`) * 1080
    return <circle key={i} cx={x} cy={y} r={random(`gr${i}`) * 1.3} fill="#fff" />
  })
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none', mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%">{dots}</svg>
    </AbsoluteFill>
  )
}

/* ===================================================================== */
/*  A — Aurora Glass (Aceternity bg + Magic UI glass panel)              */
/* ===================================================================== */

export const BakeoffAuroraGlass: React.FC<BakeoffProps> = (p) => {
  const props = { ...DEMO, ...p }
  const accent = props.accentColor ?? BRAND_ACCENT
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_BG, justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <Aurora accent={accent} />
      <Grain />
      <div
        style={{
          width: 1340,
          padding: '92px 110px',
          borderRadius: 36,
          background: 'rgba(20,9,6,0.55)',
          backdropFilter: 'blur(34px)',
          border: `1px solid ${accent}55`,
          boxShadow: `0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 ${BRAND_FG}22, 0 0 60px ${accent}22`,
          opacity: cardIn,
          transform: `translateY(${interpolate(cardIn, [0, 1], [50, 0])}px) scale(${interpolate(cardIn, [0, 1], [0.96, 1])})`
        }}
      >
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 26, letterSpacing: 8, color: accent, marginBottom: 22 }}>
          {props.kicker}
        </div>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 132, lineHeight: 0.95, color: BRAND_FG, marginBottom: 56 }}>
          {props.heading}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          {props.items.map((item, i) => {
            const e = spring({ frame: frame - 12 - i * 6, fps, config: { damping: 18, stiffness: 120 } })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: e, transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)` }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 62,
                    height: 62,
                    borderRadius: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Bebas Neue',
                    fontSize: 40,
                    color: BRAND_BG,
                    background: accent,
                    boxShadow: `0 8px 24px ${accent}66, inset 0 1px 0 ${BRAND_FG}33`
                  }}
                >
                  {i + 1}
                </div>
                <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 58, color: BRAND_FG, lineHeight: 1.05 }}>
                  {item}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}

/* ===================================================================== */
/*  B — Editorial Bold (MrBeast/Hormozi oversized type, no card)         */
/* ===================================================================== */

export const BakeoffEditorial: React.FC<BakeoffProps> = (p) => {
  const props = { ...DEMO, ...p }
  const accent = props.accentColor ?? BRAND_ACCENT
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const headIn = spring({ frame, fps, config: { damping: 22, stiffness: 100 } })

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_BG, justifyContent: 'center', padding: '0 150px' }}>
      <PrestyjFonts />
      <GridOverlay color={accent} opacity={0.05} cellSize={80} />
      <Grain opacity={0.05} />
      <div style={{ opacity: headIn, transform: `translateY(${interpolate(headIn, [0, 1], [40, 0])}px)` }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 28, letterSpacing: 10, color: accent, marginBottom: 18 }}>
          {props.kicker}
        </div>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 168, lineHeight: 0.9, color: BRAND_FG, marginBottom: 18, position: 'relative' }}>
          {props.heading}
        </div>
        <div style={{ position: 'relative', height: 8, marginBottom: 70 }}>
          <AccentLine color={accent} width={420} height={8} durationFrames={26} delayFrames={8} y={0} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
        {props.items.map((item, i) => {
          const e = spring({ frame: frame - 18 - i * 8, fps, config: { damping: 18, stiffness: 110 } })
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 40, opacity: e, transform: `translateY(${interpolate(e, [0, 1], [30, 0])}px)` }}>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 96, color: accent, lineHeight: 1, width: 130, flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 70, color: BRAND_FG, lineHeight: 1.0 }}>
                {item}
              </span>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

/* ===================================================================== */
/*  C — Bento Spotlight (Magic UI bento, each item its own glass tile)   */
/* ===================================================================== */

export const BakeoffBento: React.FC<BakeoffProps> = (p) => {
  const props = { ...DEMO, ...p }
  const accent = props.accentColor ?? BRAND_ACCENT
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const headIn = spring({ frame, fps, config: { damping: 22, stiffness: 100 } })

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_BG, justifyContent: 'center', alignItems: 'center', padding: '0 120px' }}>
      <PrestyjFonts />
      <Aurora accent={accent} intensity={0.8} />
      <div style={{ textAlign: 'center', marginBottom: 64, opacity: headIn, transform: `translateY(${interpolate(headIn, [0, 1], [40, 0])}px)` }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 26, letterSpacing: 8, color: accent, marginBottom: 16 }}>
          {props.kicker}
        </div>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 128, lineHeight: 0.95, color: BRAND_FG }}>{props.heading}</div>
      </div>
      <div style={{ display: 'flex', gap: 36, width: '100%', justifyContent: 'center' }}>
        {props.items.map((item, i) => {
          const e = spring({ frame: frame - 14 - i * 7, fps, config: { damping: 18, stiffness: 120 } })
          return (
            <div
              key={i}
              style={{
                flex: 1,
                maxWidth: 460,
                minHeight: 360,
                padding: 48,
                borderRadius: 28,
                background: `radial-gradient(120% 80% at 50% 0%, ${accent}1f 0%, rgba(12,5,3,0.7) 60%)`,
                backdropFilter: 'blur(24px)',
                border: `1px solid ${accent}44`,
                boxShadow: `0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 ${BRAND_FG}1a`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                opacity: e,
                transform: `translateY(${interpolate(e, [0, 1], [40, 0])}px) scale(${interpolate(e, [0, 1], [0.95, 1])})`
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Bebas Neue',
                  fontSize: 48,
                  color: BRAND_BG,
                  background: accent,
                  boxShadow: `0 10px 30px ${accent}66, inset 0 1px 0 ${BRAND_FG}33`
                }}
              >
                {i + 1}
              </div>
              <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 46, color: BRAND_FG, lineHeight: 1.1 }}>{item}</span>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

/* ===================================================================== */
/*  D — Terminal Data (reuses your DarkCard/GlowDot/AccentLine system)    */
/* ===================================================================== */

export const BakeoffTerminal: React.FC<BakeoffProps> = (p) => {
  const props = { ...DEMO, ...p }
  const accent = props.accentColor ?? BRAND_ACCENT
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90 } })

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_BG, justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <GridOverlay color={accent} opacity={0.05} cellSize={64} />
      <div style={{ opacity: cardIn, transform: `translateY(${interpolate(cardIn, [0, 1], [40, 0])}px)`, width: 1320 }}>
        <DarkCard accentColor={accent} width="100%" padding={72}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <GlowDot status="online" size={12} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 24, letterSpacing: 6, color: accent }}>{props.kicker}</span>
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 124, lineHeight: 0.95, color: BRAND_FG, marginBottom: 22 }}>
            {props.heading}
          </div>
          <div style={{ position: 'relative', height: 2, marginBottom: 52 }}>
            <AccentLine color={accent} width="100%" height={2} durationFrames={28} delayFrames={6} y={0} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
            {props.items.map((item, i) => {
              const e = spring({ frame: frame - 16 - i * 6, fps, config: { damping: 18, stiffness: 120 } })
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: e, transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)` }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 30, color: accent, width: 64, flexShrink: 0 }}>
                    {`0${i + 1}`}
                  </span>
                  <GlowDot color={accent} size={10} pulse={false} />
                  <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 56, color: BRAND_FG, lineHeight: 1.05 }}>
                    {item}
                  </span>
                </div>
              )
            })}
          </div>
        </DarkCard>
      </div>
    </AbsoluteFill>
  )
}
