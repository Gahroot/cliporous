/**
 * Checklist — rows that tick in one at a time.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. Inner
 * content uses shadcn `Badge` (x/y done) + `Separator`, with lucide `Check`
 * (done, accent) / `Circle` (pending, dim). The tick stamps in with a spring
 * overshoot; all motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { Check, Circle } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { ChecklistProps } from './types'

export const Checklist: React.FC<ChecklistProps> = ({
  skinId,
  kicker,
  heading,
  items,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })
  const doneCount = items.filter((it) => it.done).length

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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <Kicker accent={accent}>{kicker}</Kicker>
              <Heading>{heading}</Heading>
            </div>
            <Badge
              className="border-transparent"
              style={{
                backgroundColor: `${accent}22`,
                color: accent,
                fontFamily: 'JetBrains Mono',
                fontSize: 26,
                padding: '10px 20px',
                borderRadius: 999,
                marginTop: 8,
                whiteSpace: 'nowrap'
              }}
            >
              {doneCount}/{items.length} done
            </Badge>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 16 - i * 7,
                fps,
                config: { damping: 14, stiffness: 150, mass: 0.7 }
              })
              const tickScale = interpolate(e, [0, 1], [0.4, 1])
              return (
                <div key={i}>
                  {i > 0 && (
                    <Separator style={{ opacity: 0.5 * e, backgroundColor: `${accent}33` }} />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 28,
                      padding: '24px 4px',
                      opacity: interpolate(e, [0, 1], [0, 1])
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 60,
                        height: 60,
                        borderRadius: 18,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: item.done ? accent : 'transparent',
                        border: item.done ? 'none' : `2px solid ${BRAND_FG}33`,
                        boxShadow: item.done ? `0 8px 24px ${accent}55` : 'none',
                        transform: `scale(${tickScale})`
                      }}
                    >
                      {item.done ? (
                        <Check size={36} color={BRAND_BG} strokeWidth={3} />
                      ) : (
                        <Circle size={28} color={`${BRAND_FG}55`} strokeWidth={2.5} />
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: 'Geist',
                        fontWeight: 700,
                        fontSize: 46,
                        lineHeight: 1.1,
                        color: item.done ? BRAND_FG : `${BRAND_FG}aa`
                      }}
                    >
                      {item.text}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
