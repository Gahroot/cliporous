/**
 * Timeline — a vertical step sequence with a connecting spine.
 *
 * A *content block*: it knows nothing about color or surface. It composes a
 * `BlockSkin` for its look (background, surface, index chip) so the same block
 * renders in every skin. New blocks should follow this shape.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS, type SkinId } from '../../shared/skins'

export interface TimelineStep {
  /** Bold step title. */
  title: string
  /** Optional supporting line. */
  detail?: string
}

export interface TimelineProps {
  /** Which visual skin to render in. */
  skinId: SkinId
  kicker: string
  heading: string
  steps: TimelineStep[]
  accentColor?: string
}

export const Timeline: React.FC<TimelineProps> = ({
  skinId,
  kicker,
  heading,
  steps,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })

  // Spine draws downward as steps reveal.
  const spineProgress = interpolate(frame, [14, 14 + steps.length * 7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_BG, justifyContent: 'center', alignItems: 'center' }}>
      <PrestyjFonts />
      <skin.Background accent={accent} />
      <div
        style={{
          opacity: cardIn,
          transform: `translateY(${interpolate(cardIn, [0, 1], [50, 0])}px)`
        }}
      >
        <skin.Surface accent={accent}>
          <Kicker accent={accent}>{kicker}</Kicker>
          <Heading>{heading}</Heading>

          <div style={{ position: 'relative', marginTop: 56, paddingLeft: 8 }}>
            {/* Spine */}
            <div
              style={{
                position: 'absolute',
                left: 38,
                top: 40,
                bottom: 40,
                width: 3,
                background: `${accent}44`,
                transformOrigin: 'top',
                transform: `scaleY(${spineProgress})`
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              {steps.map((step, i) => {
                const e = spring({
                  frame: frame - 16 - i * 7,
                  fps,
                  config: { damping: 18, stiffness: 120 }
                })
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 32,
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)`
                    }}
                  >
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <skin.Chip accent={accent} index={i + 1} size={62} />
                    </div>
                    <div style={{ paddingTop: 4 }}>
                      <div
                        style={{
                          fontFamily: 'Geist',
                          fontWeight: 700,
                          fontSize: 52,
                          color: BRAND_FG,
                          lineHeight: 1.05
                        }}
                      >
                        {step.title}
                      </div>
                      {step.detail && (
                        <div
                          style={{
                            fontFamily: 'Geist',
                            fontWeight: 400,
                            fontSize: 30,
                            color: `${BRAND_FG}99`,
                            marginTop: 8,
                            lineHeight: 1.3
                          }}
                        >
                          {step.detail}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
