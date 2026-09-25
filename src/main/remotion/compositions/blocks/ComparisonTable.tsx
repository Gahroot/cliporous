/**
 * ComparisonTable — two shadcn Card columns with Badge headers and lucide
 * Check / X rows (a shadcn-flavored upgrade of the Comparison block).
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look; the
 * two columns are shadcn `Card`s. Columns slide in from opposite sides; rows
 * stagger. All motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import { Check, X } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { breakWordStyle, CHAR_WIDTH_RATIO, clampStyle, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { ComparisonTableProps } from './types';

const POSITIVE = '#4ade80';
const NEGATIVE = '#f87171';

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  skinId,
  kicker,
  heading,
  leftTitle,
  rightTitle,
  leftItems,
  rightItems,
  positiveSide = 'left',
  accentColor,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const skin = SKINS[skinId];
  const pal: Palette = palette ?? {
    id: 'brand',
    name: 'Brand Default',
    background: BRAND_BG,
    foreground: BRAND_FG,
    accent: BRAND_ACCENT,
    builtin: true,
  };
  const accent = accentColor ?? palette?.accent ?? skin.accent;
  const motion = useBlockMotion();
  const cw = SKIN_CONTENT_WIDTH[skinId];
  // Two flex-1 Cards (gap 32); each CardContent p-10 (40px) holds a 48px icon
  // tile + 20px gap before the row text.
  const rowText = Math.round((cw - 32) / 2) - 80 - 48 - 20;

  const column = (
    title: string,
    items: string[],
    positive: boolean,
    fromX: number,
  ): React.ReactNode => {
    const colIn = spring({
      frame: frame - 14,
      fps,
      config: { damping: 20, stiffness: 100, mass: 0.9 },
    });
    const tint = positive ? POSITIVE : NEGATIVE;
    const Mark = positive ? Check : X;
    return (
      <Card
        className="flex-1 border bg-card text-card-foreground"
        style={{
          borderColor: `${tint}33`,
          boxShadow: `0 22px 60px rgba(0,0,0,0.45), inset 0 1px 0 ${pal.foreground}12`,
          opacity: colIn,
          transform: `translateX(${interpolate(colIn, [0, 1], [fromX, 0])}px)`,
        }}
      >
        <CardContent className="p-10">
          <Badge
            className="border-transparent"
            style={{
              backgroundColor: `${tint}22`,
              color: tint,
              fontFamily: 'JetBrains Mono',
              fontSize: 28,
              letterSpacing: 4,
              padding: '12px 24px',
              borderRadius: 12,
              maxWidth: '100%',
              ...breakWordStyle,
              ...clampStyle(2),
            }}
          >
            {title}
          </Badge>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 36 }}>
            {items.map((item, i) => {
              const e = spring({
                frame: frame - 24 - i * 6,
                fps,
                config: { damping: 18, stiffness: 120, mass: 0.8 },
              });
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    opacity: e,
                    transform: `translateY(${interpolate(e, [0, 1], [18, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${tint}1f`,
                      border: `1px solid ${tint}44`,
                    }}
                  >
                    <Mark size={28} color={tint} strokeWidth={3} />
                  </div>
                  <FitText
                    maxWidth={rowText}
                    maxFontSize={32}
                    minFontSize={22}
                    maxLines={2}
                    charWidthRatio={CHAR_WIDTH_RATIO.geist}
                    style={{
                      flex: 1,
                      fontFamily: 'Geist',
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: `${pal.foreground}e6`,
                    }}
                  >
                    {item}
                  </FitText>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AbsoluteFill
      style={{ backgroundColor: pal.background, justifyContent: 'center', alignItems: 'center' }}
    >
      <PrestyjFonts />
      <skin.Background accent={accent} bg={pal.background} fg={pal.foreground} />
      <div
        style={{
          ...motion,
        }}
      >
        <skin.Surface accent={accent} bg={pal.background} fg={pal.foreground}>
          <Kicker accent={accent} maxWidth={cw}>
            {kicker}
          </Kicker>
          <Heading fg={pal.foreground} maxWidth={cw}>
            {heading}
          </Heading>
          <div style={{ display: 'flex', gap: 32, marginTop: 56, alignItems: 'stretch' }}>
            {column(leftTitle, leftItems, positiveSide === 'left', -40)}
            {column(rightTitle, rightItems, positiveSide === 'right', 40)}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
