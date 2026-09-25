/**
 * Comparison — two columns (✓ do this / ✕ not this) side by side.
 *
 * A *content block*: it composes a `BlockSkin` (via `skinId`) for its look so
 * the same block renders in every skin. All motion is frame-clock driven.
 */

import type { Palette } from '@shared/palettes';
import type React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../../edit-styles/shared/brand';
import { useBlockMotion } from '../../shared/block-motion';
import { CHAR_WIDTH_RATIO, FitText } from '../../shared/fit-text';
import { PrestyjFonts } from '../../shared/fonts';
import { Heading, Kicker, SKIN_CONTENT_WIDTH, SKINS } from '../../shared/skins';
import type { ComparisonProps } from './types';

const NEGATIVE = '#e0683f';

const Mark: React.FC<{
  kind: 'check' | 'cross';
  color: string;
  progress: number;
  bg: string;
}> = ({ kind, color, progress, bg }) => (
  <div
    style={{
      flexShrink: 0,
      width: 52,
      height: 52,
      borderRadius: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Geist',
      fontWeight: 700,
      fontSize: 34,
      lineHeight: 1,
      color: bg,
      background: color,
      boxShadow: `0 6px 18px ${color}55`,
      transform: `scale(${interpolate(progress, [0, 1], [0.4, 1])})`,
      opacity: progress,
    }}
  >
    {kind === 'check' ? '✓' : '✕'}
  </div>
);

const Column: React.FC<{
  title: string;
  items: string[];
  kind: 'check' | 'cross';
  markColor: string;
  accent: string;
  startFrame: number;
  bg: string;
  fg: string;
  colWidth: number;
}> = ({ title, items, kind, markColor, accent, startFrame, bg, fg, colWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Row = 52px mark + 24px gap + text.
  const itemText = colWidth - 52 - 24;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 30 }}>
      <FitText
        maxWidth={colWidth}
        maxFontSize={56}
        minFontSize={34}
        maxLines={2}
        charWidthRatio={CHAR_WIDTH_RATIO.bebas}
        letterSpacing={1}
        style={{
          fontFamily: 'Bebas Neue',
          lineHeight: 1,
          letterSpacing: 1,
          color: kind === 'check' ? accent : `${fg}88`,
          paddingBottom: 22,
          borderBottom: `2px solid ${kind === 'check' ? accent : fg}2e`,
        }}
      >
        {title}
      </FitText>
      {items.map((item, i) => {
        const e = spring({
          frame: frame - startFrame - i * 6,
          fps,
          config: { damping: 18, stiffness: 120 },
        });
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              opacity: e,
              transform: `translateY(${interpolate(e, [0, 1], [22, 0])}px)`,
            }}
          >
            <Mark kind={kind} color={markColor} progress={e} bg={bg} />
            <FitText
              maxWidth={itemText}
              maxFontSize={38}
              minFontSize={24}
              maxLines={2}
              charWidthRatio={CHAR_WIDTH_RATIO.geist}
              style={{
                flex: 1,
                fontFamily: 'Geist',
                fontWeight: 700,
                lineHeight: 1.1,
                color: kind === 'check' ? fg : `${fg}99`,
              }}
            >
              {item}
            </FitText>
          </div>
        );
      })}
    </div>
  );
};

export const Comparison: React.FC<ComparisonProps> = ({
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
  const leftIsPositive = positiveSide === 'left';
  const cw = SKIN_CONTENT_WIDTH[skinId];
  // Two columns separated by an 80px gap.
  const colWidth = Math.round((cw - 80) / 2);
  const dividerProgress = interpolate(frame, [16, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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

          <div style={{ position: 'relative', display: 'flex', gap: 80, marginTop: 60 }}>
            <Column
              title={leftTitle}
              items={leftItems}
              kind={leftIsPositive ? 'check' : 'cross'}
              markColor={leftIsPositive ? accent : NEGATIVE}
              accent={accent}
              startFrame={18}
              bg={pal.background}
              fg={pal.foreground}
              colWidth={colWidth}
            />
            {/* Center divider */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 2,
                marginLeft: -1,
                background: `${pal.foreground}26`,
                transformOrigin: 'top',
                transform: `scaleY(${dividerProgress})`,
              }}
            />
            <Column
              title={rightTitle}
              items={rightItems}
              kind={leftIsPositive ? 'cross' : 'check'}
              markColor={leftIsPositive ? NEGATIVE : accent}
              accent={accent}
              startFrame={24}
              bg={pal.background}
              fg={pal.foreground}
              colWidth={colWidth}
            />
          </div>
        </skin.Surface>
      </div>
    </AbsoluteFill>
  );
};
