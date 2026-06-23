/**
 * TweetCard — a shadcn Card styled as a social post: Avatar, handle with a
 * lucide BadgeCheck verified mark, body, and an engagement row.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * post is a shadcn `Card`, the author uses shadcn `Avatar` and the engagement
 * counts use shadcn `Badge`. All motion is frame-clock driven.
 */
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { BadgeCheck, Heart, Repeat2, MessageCircle } from 'lucide-react'
import { BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand'
import { PrestyjFonts } from '../../shared/fonts'
import { Kicker, Heading, SKINS } from '../../shared/skins'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import type { TweetCardProps } from './types'

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export const TweetCard: React.FC<TweetCardProps> = ({
  skinId,
  kicker,
  heading,
  name,
  handle,
  verified,
  avatarUrl,
  body,
  replies,
  reposts,
  likes,
  accentColor
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const skin = SKINS[skinId]
  const accent = accentColor ?? skin.accent
  const cardIn = spring({ frame, fps, config: { damping: 20, stiffness: 90, mass: 0.9 } })
  const bodyIn = spring({ frame: frame - 20, fps, config: { damping: 18, stiffness: 110 } })
  const statsIn = spring({ frame: frame - 34, fps, config: { damping: 18, stiffness: 110 } })

  const stat = (
    Icon: typeof Heart,
    count: string | undefined,
    tint: string,
    key: string
  ): React.ReactNode =>
    count ? (
      <Badge
        key={key}
        variant="outline"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          borderColor: `${BRAND_FG}1f`,
          color: `${BRAND_FG}cc`,
          fontFamily: 'JetBrains Mono',
          fontSize: 26,
          padding: '10px 18px',
          borderRadius: 999
        }}
      >
        <Icon size={26} color={tint} strokeWidth={2.4} />
        {count}
      </Badge>
    ) : null

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

          <Card
            className="border bg-card text-card-foreground"
            style={{
              marginTop: 48,
              borderColor: `${accent}33`,
              boxShadow: `0 26px 70px rgba(0,0,0,0.45), inset 0 1px 0 ${BRAND_FG}12`
            }}
          >
            <CardContent className="p-12">
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <Avatar
                  className="h-24 w-24"
                  style={{ border: `2px solid ${accent}66`, boxShadow: `0 0 24px ${accent}33` }}
                >
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                  <AvatarFallback
                    style={{
                      background: `${accent}22`,
                      color: accent,
                      fontFamily: 'Bebas Neue',
                      fontSize: 42
                    }}
                  >
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 40, color: BRAND_FG }}>
                      {name}
                    </span>
                    {verified && <BadgeCheck size={36} color={accent} strokeWidth={2.4} />}
                  </div>
                  <div style={{ fontFamily: 'Geist', fontSize: 30, color: `${BRAND_FG}88`, marginTop: 2 }}>
                    @{handle}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: 'Geist',
                  fontSize: 46,
                  lineHeight: 1.3,
                  color: `${BRAND_FG}f2`,
                  marginTop: 34,
                  opacity: bodyIn,
                  transform: `translateY(${interpolate(bodyIn, [0, 1], [16, 0])}px)`
                }}
              >
                {body}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  marginTop: 40,
                  opacity: statsIn,
                  transform: `translateY(${interpolate(statsIn, [0, 1], [16, 0])}px)`
                }}
              >
                {stat(MessageCircle, replies, '#60a5fa', 'replies')}
                {stat(Repeat2, reposts, '#4ade80', 'reposts')}
                {stat(Heart, likes, '#f87171', 'likes')}
              </div>
            </CardContent>
          </Card>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  )
}
