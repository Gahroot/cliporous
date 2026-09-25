/**
 * StatHero — one giant number that counts up to its target.
 *
 * A *content block*: composes a `BlockSkin` (via `skinId`) for its look. The
 * delta is a quiet qualifier with a lucide direction icon.
 * Type is sized to the final value so the count-up never resizes it.
 */

import type { Palette } from '@shared/palettes';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { getBlockReveal, useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, computeFitFontSize, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { StatHeroProps } from './types';

// Tabular figures are wider than Geist's average prose glyph. Reserve room for
// currency, signs, and suffixes; size once from the final string, not each frame.
const VALUE_CHAR_WIDTH_RATIO = 0.68;

export const StatHero: React.FC<StatHeroProps> = ({
  skinId,
  kicker,
  heading,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  label,
  trend,
  delta,
  accentColor,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
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
  // Centered hero: let the headline number use the full measure; keep the
  // supporting copy at a readable width.
  const valueWidth = cw - 40;
  const labelWidth = Math.min(cw - 80, 1100);

  const progress = getBlockReveal(frame, fps, durationInFrames);
  const display = `${prefix}${(progress * value).toFixed(decimals)}${suffix}`;
  const finalDisplay = `${prefix}${value.toFixed(decimals)}${suffix}`;
  const valueSize = computeFitFontSize(finalDisplay, {
    maxWidth: valueWidth,
    maxFontSize: 260,
    minFontSize: 72,
    maxLines: 1,
    charWidthRatio: VALUE_CHAR_WIDTH_RATIO,
  });
  const deltaIn = getBlockReveal(frame, fps, durationInFrames, 1, 2);
  const TrendIcon = trend === 'down' ? TrendingDown : trend === 'up' ? TrendingUp : null;

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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <Kicker accent={accent} maxWidth={cw}>
              {kicker}
            </Kicker>
            <Heading size={72} fg={pal.foreground} maxWidth={cw}>
              {heading}
            </Heading>

            <FitText
              maxWidth={valueWidth}
              maxFontSize={valueSize}
              minFontSize={valueSize}
              maxLines={1}
              charWidthRatio={VALUE_CHAR_WIDTH_RATIO}
              style={{
                fontFamily: 'Geist',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.12,
                color: pal.foreground,
                marginTop: 32,
                width: valueWidth,
                textAlign: 'center',
              }}
            >
              {display}
            </FitText>

            <FitText
              maxWidth={labelWidth}
              maxFontSize={38}
              minFontSize={26}
              maxLines={2}
              charWidthRatio={CHAR_WIDTH_RATIO.geist}
              style={{
                fontFamily: 'Geist',
                fontWeight: 700,
                color: `${pal.foreground}cc`,
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              {label}
            </FitText>

            {delta && (
              <div
                style={{
                  marginTop: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  color: pal.foreground,
                  borderTop: `2px solid ${accent}`,
                  maxWidth: labelWidth,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 30,
                  paddingTop: 22,
                  opacity: deltaIn,
                }}
              >
                {TrendIcon && <TrendIcon size={30} color={accent} style={{ flexShrink: 0 }} />}
                <FitText
                  maxWidth={labelWidth - (TrendIcon ? 42 : 0)}
                  maxFontSize={30}
                  minFontSize={22}
                  maxLines={2}
                  charWidthRatio={CHAR_WIDTH_RATIO.mono}
                >
                  {delta}
                </FitText>
              </div>
            )}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
