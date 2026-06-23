/**
 * Block skins — the visual language a block is rendered in.
 *
 * A *skin* owns the look: full-bleed Background, the content Surface (panel /
 * card / bare), and the index Chip. A *block* (BulletList, Timeline, BarChart…)
 * owns the content layout and is written once, then renders in any skin.
 *
 *     <Timeline skin={SKINS.terminal} steps={...} />
 *
 * This is the matrix that lets us add new content types cheaply: a new block
 * automatically inherits all four looks.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, random } from 'remotion'
import { BRAND_BG, BRAND_FG, BRAND_ACCENT } from '../../edit-styles/shared/brand'
import { DarkCard, GridOverlay } from './primitives'

/* ===================================================================== */
/*  Shared decoration                                                     */
/* ===================================================================== */

export const Aurora: React.FC<{ accent?: string; intensity?: number }> = ({
  accent = BRAND_ACCENT,
  intensity = 1
}) => {
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
          opacity: 0.5 * intensity
        }}
      />
    )
  }
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {blob(0, 120, 80, accent, 760)}
      {blob(1, 1180, 540, accent, 560)}
      {blob(2, 620, 760, accent, 520)}
    </AbsoluteFill>
  )
}

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const dots = Array.from({ length: 220 }, (_, i) => (
    <circle
      key={i}
      cx={random(`gx${i}`) * 1920}
      cy={random(`gy${i}`) * 1080}
      r={random(`gr${i}`) * 1.3}
      fill="#fff"
    />
  ))
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none', mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%">{dots}</svg>
    </AbsoluteFill>
  )
}

/* ===================================================================== */
/*  Skin contract                                                         */
/* ===================================================================== */

export interface SkinChrome {
  accent: string
}

export interface BlockSkin {
  id: string
  name: string
  accent: string
  /** Full-bleed background decoration. */
  Background: React.FC<SkinChrome>
  /** Wraps block content. Renders the panel/card/bare surface. */
  Surface: React.FC<SkinChrome & { children: React.ReactNode; width?: number }>
  /** Numbered index marker used by list-like blocks. */
  Chip: React.FC<SkinChrome & { index: number; size?: number }>
}

/* ===================================================================== */
/*  Skin: Aurora Glass                                                    */
/* ===================================================================== */

const AuroraGlass: BlockSkin = {
  id: 'aurora-glass',
  name: 'Aurora Glass',
  accent: BRAND_ACCENT,
  Background: ({ accent }) => (
    <>
      <Aurora accent={accent} />
      <Grain opacity={0.06} />
    </>
  ),
  Surface: ({ accent, children, width = 1340 }) => (
    <div
      style={{
        width,
        padding: '88px 104px',
        borderRadius: 36,
        background: 'rgba(20,9,6,0.55)',
        backdropFilter: 'blur(34px)',
        border: `1px solid ${accent}55`,
        boxShadow: `0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 ${BRAND_FG}22, 0 0 60px ${accent}22`
      }}
    >
      {children}
    </div>
  ),
  Chip: ({ accent, index, size = 62 }) => (
    <div
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size * 0.29,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Bebas Neue',
        fontSize: size * 0.64,
        color: BRAND_BG,
        background: accent,
        boxShadow: `0 8px 24px ${accent}66, inset 0 1px 0 ${BRAND_FG}33`
      }}
    >
      {index}
    </div>
  )
}

/* ===================================================================== */
/*  Skin: Editorial Bold                                                  */
/* ===================================================================== */

const Editorial: BlockSkin = {
  id: 'editorial',
  name: 'Editorial Bold',
  accent: BRAND_ACCENT,
  Background: ({ accent }) => (
    <>
      <GridOverlay color={accent} opacity={0.05} cellSize={80} />
      <Grain opacity={0.05} />
    </>
  ),
  Surface: ({ children, width = 1620 }) => (
    <div style={{ width, padding: '0 24px' }}>{children}</div>
  ),
  Chip: ({ accent, index, size = 96 }) => (
    <span
      style={{
        fontFamily: 'Bebas Neue',
        fontSize: size,
        color: accent,
        lineHeight: 1,
        flexShrink: 0
      }}
    >
      {String(index).padStart(2, '0')}
    </span>
  )
}

/* ===================================================================== */
/*  Skin: Bento Spotlight                                                 */
/* ===================================================================== */

const Bento: BlockSkin = {
  id: 'bento',
  name: 'Bento Spotlight',
  accent: BRAND_ACCENT,
  Background: ({ accent }) => <Aurora accent={accent} intensity={0.8} />,
  Surface: ({ accent, children, width = 1480 }) => (
    <div
      style={{
        width,
        padding: '72px 80px',
        borderRadius: 32,
        background: `radial-gradient(120% 90% at 50% 0%, ${accent}1f 0%, rgba(12,5,3,0.7) 60%)`,
        backdropFilter: 'blur(24px)',
        border: `1px solid ${accent}44`,
        boxShadow: `0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 ${BRAND_FG}1a`
      }}
    >
      {children}
    </div>
  ),
  Chip: ({ accent, index, size = 70 }) => (
    <div
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size * 0.28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Bebas Neue',
        fontSize: size * 0.66,
        color: BRAND_BG,
        background: accent,
        boxShadow: `0 10px 30px ${accent}66, inset 0 1px 0 ${BRAND_FG}33`
      }}
    >
      {index}
    </div>
  )
}

/* ===================================================================== */
/*  Skin: Terminal Data                                                   */
/* ===================================================================== */

const Terminal: BlockSkin = {
  id: 'terminal',
  name: 'Terminal Data',
  accent: BRAND_ACCENT,
  Background: ({ accent }) => <GridOverlay color={accent} opacity={0.05} cellSize={64} />,
  Surface: ({ accent, children, width = 1320 }) => (
    <DarkCard accentColor={accent} width={width} padding={72}>
      {children}
    </DarkCard>
  ),
  Chip: ({ accent, index, size = 30 }) => (
    <span
      style={{
        fontFamily: 'JetBrains Mono',
        fontSize: size,
        color: accent,
        flexShrink: 0
      }}
    >
      {String(index).padStart(2, '0')}
    </span>
  )
}

export const SKINS = {
  'aurora-glass': AuroraGlass,
  editorial: Editorial,
  bento: Bento,
  terminal: Terminal
} as const

export type SkinId = keyof typeof SKINS

/* ===================================================================== */
/*  Shared text chrome                                                    */
/* ===================================================================== */

export const Kicker: React.FC<{ children: React.ReactNode; accent?: string }> = ({
  children,
  accent = BRAND_ACCENT
}) => (
  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 26, letterSpacing: 8, color: accent, marginBottom: 20 }}>
    {children}
  </div>
)

export const Heading: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 128
}) => (
  <div style={{ fontFamily: 'Bebas Neue', fontSize: size, lineHeight: 0.95, color: BRAND_FG }}>
    {children}
  </div>
)
