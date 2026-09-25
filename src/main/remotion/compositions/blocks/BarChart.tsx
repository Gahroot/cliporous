/** Bars grow from one baseline; labels keep their final, readable positions. */
import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { getBlockReveal, useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { BarChartProps } from './types';

const CHART_HEIGHT = 360;
const VALUE_SPACE = 64;
const COLUMN_GAP = 28;

export const BarChart: React.FC<BarChartProps> = ({
  skinId,
  kicker,
  heading,
  bars,
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
  const columnWidth = Math.max(1, (cw - COLUMN_GAP * (bars.length - 1)) / Math.max(1, bars.length));

  return (
    <AbsoluteFill
      style={{ backgroundColor: pal.background, justifyContent: 'center', alignItems: 'center' }}
    >
      <PrestyjFonts />
      <skin.Background accent={accent} bg={pal.background} fg={pal.foreground} />
      <div style={{ ...motion }}>
        <skin.Surface accent={accent} bg={pal.background} fg={pal.foreground}>
          <Kicker accent={accent} maxWidth={cw}>
            {kicker}
          </Kicker>
          <Heading fg={pal.foreground} maxWidth={cw}>
            {heading}
          </Heading>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              gap: COLUMN_GAP,
              marginTop: 56,
            }}
          >
            {/* The rule intersects the bar bottoms, never the category labels. */}
            <div
              style={{
                position: 'absolute',
                top: CHART_HEIGHT,
                left: 0,
                right: 0,
                height: 2,
                background: `${pal.foreground}55`,
              }}
            />
            {bars.map((bar, i) => {
              const grow = getBlockReveal(frame, fps, durationInFrames, i, bars.length);
              const value = Math.max(0, Math.min(1, bar.value));
              const barHeight = value * (CHART_HEIGHT - VALUE_SPACE);
              return (
                <div key={i} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: CHART_HEIGHT, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: barHeight + 16,
                        width: '100%',
                        opacity: grow,
                      }}
                    >
                      <FitText
                        maxWidth={columnWidth}
                        maxFontSize={40}
                        minFontSize={24}
                        maxLines={1}
                        charWidthRatio={CHAR_WIDTH_RATIO.geist}
                        style={{
                          fontFamily: 'Geist',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: 1.15,
                          color: pal.foreground,
                          textAlign: 'center',
                        }}
                      >
                        {bar.valueLabel}
                      </FitText>
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '50%',
                        width: '60%',
                        maxWidth: 156,
                        height: barHeight,
                        borderRadius: '4px 4px 0 0',
                        background: accent,
                        transformOrigin: 'center bottom',
                        transform: `translateX(-50%) scaleY(${grow})`,
                      }}
                    />
                  </div>
                  <FitText
                    maxWidth={columnWidth}
                    maxFontSize={30}
                    minFontSize={22}
                    maxLines={2}
                    charWidthRatio={CHAR_WIDTH_RATIO.geist}
                    style={{
                      fontFamily: 'Geist',
                      fontWeight: 700,
                      color: pal.foreground,
                      paddingTop: 24,
                      minHeight: 96,
                      lineHeight: 1.25,
                      textAlign: 'center',
                    }}
                  >
                    {bar.label}
                  </FitText>
                </div>
              );
            })}
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
