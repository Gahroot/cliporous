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

import { getPaletteById, type Palette } from '@shared/palettes';
import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from '../../edit-styles/shared/brand';
import { CHAR_WIDTH_RATIO, FitText } from './fit-text';
import { DarkCard, GridOverlay } from './primitives';

/* ===================================================================== */
/*  Shared decoration                                                     */
/* ===================================================================== */

export const Aurora: React.FC<{ accent?: string; intensity?: number }> = ({
  accent = BRAND_ACCENT,
  intensity = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const blob = (i: number, baseX: number, baseY: number, color: string, size: number) => {
    const x = baseX + Math.sin(t * 0.25 + i) * 90;
    const y = baseY + Math.cos(t * 0.2 + i * 1.7) * 70;
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
          opacity: 0.5 * intensity,
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {blob(0, 120, 80, accent, 760)}
      {blob(1, 1180, 540, accent, 560)}
      {blob(2, 620, 760, accent, 520)}
    </AbsoluteFill>
  );
};

export const Grain: React.FC<{ opacity?: number; fg?: string }> = ({
  opacity = 0.05,
  fg = BRAND_FG,
}) => {
  const dots = Array.from({ length: 220 }, (_, i) => (
    <circle
      key={i}
      cx={random(`gx${i}`) * 1920}
      cy={random(`gy${i}`) * 1080}
      r={random(`gr${i}`) * 1.3}
      fill={fg}
    />
  ));
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none', mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%">
        {dots}
      </svg>
    </AbsoluteFill>
  );
};

/* ===================================================================== */
/*  Skin contract                                                         */
/* ===================================================================== */

export interface SkinChrome {
  accent: string;
  bg: string;
  fg: string;
}

interface HeadingTypography {
  fontFamily: string;
  fontWeight: number;
  scale: number;
  charWidthRatio: number;
  letterSpacing?: number;
}

const DEFAULT_HEADING_TYPOGRAPHY: HeadingTypography = {
  fontFamily: 'Bebas Neue',
  fontWeight: 400,
  scale: 1,
  charWidthRatio: CHAR_WIDTH_RATIO.bebas,
};

const EZCODER_HEADING_TYPOGRAPHY: HeadingTypography = {
  fontFamily: 'Geist',
  fontWeight: 700,
  scale: 0.86,
  charWidthRatio: CHAR_WIDTH_RATIO.geist,
  letterSpacing: -3,
};

const EDITORIAL_HEADING_TYPOGRAPHY: HeadingTypography = {
  fontFamily: 'Geist',
  fontWeight: 700,
  scale: 0.75,
  charWidthRatio: CHAR_WIDTH_RATIO.geist,
  letterSpacing: -2,
};

const HeadingTypographyContext = React.createContext(DEFAULT_HEADING_TYPOGRAPHY);

type Rgb = readonly [number, number, number];

function parseHexColor(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, '');
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((channel) => `${channel}${channel}`)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function mixColors(base: Rgb, overlay: Rgb, amount: number): Rgb {
  return [
    Math.round(base[0] + (overlay[0] - base[0]) * amount),
    Math.round(base[1] + (overlay[1] - base[1]) * amount),
    Math.round(base[2] + (overlay[2] - base[2]) * amount),
  ];
}

function hslChannels(rgb: Rgb): string {
  const red = rgb[0] / 255;
  const green = rgb[1] / 255;
  const blue = rgb[2] / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

/** Make shadcn surfaces inherit the active render palette instead of app-global brown tokens. */
function paletteCssVariables({ accent, bg, fg }: SkinChrome): React.CSSProperties {
  const background = parseHexColor(bg) ?? ([15, 17, 21] as const);
  const foreground = parseHexColor(fg) ?? ([244, 246, 248] as const);
  const primary = parseHexColor(accent) ?? ([77, 157, 255] as const);
  const card = mixColors(background, foreground, 0.055);
  const secondary = mixColors(background, foreground, 0.1);
  const muted = mixColors(background, foreground, 0.16);
  const mutedForeground = mixColors(foreground, background, 0.38);
  const border = mixColors(background, foreground, 0.22);

  return {
    '--background': hslChannels(background),
    '--foreground': hslChannels(foreground),
    '--card': hslChannels(card),
    '--card-foreground': hslChannels(foreground),
    '--popover': hslChannels(card),
    '--popover-foreground': hslChannels(foreground),
    '--primary': hslChannels(primary),
    '--primary-foreground': hslChannels(background),
    '--secondary': hslChannels(secondary),
    '--secondary-foreground': hslChannels(foreground),
    '--accent': hslChannels(primary),
    '--accent-foreground': hslChannels(background),
    '--muted': hslChannels(muted),
    '--muted-foreground': hslChannels(mutedForeground),
    '--border': hslChannels(border),
    '--input': hslChannels(border),
    '--ring': hslChannels(primary),
  } as React.CSSProperties;
}

export interface BlockSkin {
  id: string;
  name: string;
  accent: string;
  /** Full-bleed background decoration. */
  Background: React.FC<SkinChrome>;
  /** Wraps block content. Renders the panel/card/bare surface. */
  Surface: React.FC<SkinChrome & { children: React.ReactNode; width?: number }>;
  /** Numbered index marker used by list-like blocks. */
  Chip: React.FC<SkinChrome & { index: number; size?: number }>;
}

/* ===================================================================== */
/*  Skin: Aurora Glass                                                    */
/* ===================================================================== */

const AuroraGlass: BlockSkin = {
  id: 'aurora-glass',
  name: 'Aurora Glass',
  accent: BRAND_ACCENT,
  Background: ({ accent, fg = BRAND_FG }) => (
    <>
      <Aurora accent={accent} />
      <Grain opacity={0.06} fg={fg} />
    </>
  ),
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1340 }) => (
    <div
      style={{
        ...paletteCssVariables({ accent, bg, fg }),
        width,
        padding: '88px 104px',
        borderRadius: 36,
        background: `${bg}8c`,
        backdropFilter: 'blur(34px)',
        border: `1px solid ${accent}55`,
        boxShadow: `0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 ${fg}22, 0 0 60px ${accent}22`,
      }}
    >
      {children}
    </div>
  ),
  Chip: ({ accent, bg = BRAND_BG, fg = BRAND_FG, index, size = 62 }) => (
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
        color: bg,
        background: accent,
        boxShadow: `0 8px 24px ${accent}66, inset 0 1px 0 ${fg}33`,
      }}
    >
      {index}
    </div>
  ),
};

/* ===================================================================== */
/*  Skin: Editorial Bold                                                  */
/* ===================================================================== */

const Editorial: BlockSkin = {
  id: 'editorial',
  name: 'Editorial Bold',
  accent: BRAND_ACCENT,
  // Data graphics own their rules; a decorative full-frame grid competes with them.
  Background: () => null,
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1620 }) => (
    <HeadingTypographyContext.Provider value={EDITORIAL_HEADING_TYPOGRAPHY}>
      <div style={{ ...paletteCssVariables({ accent, bg, fg }), width, padding: '0 24px' }}>
        {children}
      </div>
    </HeadingTypographyContext.Provider>
  ),
  Chip: ({ accent, index, size = 96 }) => (
    <span
      style={{
        fontFamily: 'Bebas Neue',
        fontSize: size,
        color: accent,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {String(index).padStart(2, '0')}
    </span>
  ),
};

/* ===================================================================== */
/*  Skin: Bento Spotlight                                                 */
/* ===================================================================== */

const Bento: BlockSkin = {
  id: 'bento',
  name: 'Bento Spotlight',
  accent: BRAND_ACCENT,
  Background: ({ accent }) => <Aurora accent={accent} intensity={0.8} />,
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1480 }) => (
    <div
      style={{
        ...paletteCssVariables({ accent, bg, fg }),
        width,
        padding: '72px 80px',
        borderRadius: 32,
        background: `radial-gradient(120% 90% at 50% 0%, ${accent}1f 0%, ${bg}b3 60%)`,
        backdropFilter: 'blur(24px)',
        border: `1px solid ${accent}44`,
        boxShadow: `0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 ${fg}1a`,
      }}
    >
      {children}
    </div>
  ),
  Chip: ({ accent, bg = BRAND_BG, fg = BRAND_FG, index, size = 70 }) => (
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
        color: bg,
        background: accent,
        boxShadow: `0 10px 30px ${accent}66, inset 0 1px 0 ${fg}33`,
      }}
    >
      {index}
    </div>
  ),
};

/* ===================================================================== */
/*  Skin: Terminal Data                                                   */
/* ===================================================================== */

const Terminal: BlockSkin = {
  id: 'terminal',
  name: 'Terminal Data',
  accent: BRAND_ACCENT,
  Background: ({ accent }) => <GridOverlay color={accent} opacity={0.05} cellSize={64} />,
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1320 }) => (
    <div style={{ ...paletteCssVariables({ accent, bg, fg }), width }}>
      <DarkCard accentColor={accent} width={width} padding={72}>
        {children}
      </DarkCard>
    </div>
  ),
  Chip: ({ accent, index, size = 30 }) => (
    <span
      style={{
        fontFamily: 'JetBrains Mono',
        fontSize: size,
        color: accent,
        flexShrink: 0,
      }}
    >
      {String(index).padStart(2, '0')}
    </span>
  ),
};

/* ===================================================================== */
/*  Skin: Print / Magazine                                               */
/* ===================================================================== */

/**
 * Editorial print aesthetic: serif display feel (Instrument Serif), thin
 * hairline rules, generous margins, a framed off-white-on-dark column, and a
 * whisper of paper grain. All colors are pulled from the SkinChrome props so it
 * tracks the swappable palette system — no brand hex hardcoded.
 */
const PrintMagazine: BlockSkin = {
  id: 'print-magazine',
  name: 'Print / Magazine',
  accent: BRAND_ACCENT,
  Background: ({ fg = BRAND_FG, accent }) => (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Outer hairline frame with generous margins */}
      <div
        style={{
          position: 'absolute',
          inset: 64,
          border: `1px solid ${fg}1f`,
        }}
      />
      {/* Three-column vertical hairline rules (editorial column grid) */}
      {[0.25, 0.5, 0.75].map((p) => (
        <div
          key={p}
          style={{
            position: 'absolute',
            top: 64,
            bottom: 64,
            left: `${p * 100}%`,
            width: 1,
            background: `${fg}12`,
          }}
        />
      ))}
      {/* Top + bottom accent hairline running rules */}
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          top: 104,
          height: 1,
          background: `${accent}59`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 104,
          height: 1,
          background: `${accent}59`,
        }}
      />
      <Grain opacity={0.045} fg={fg} />
    </AbsoluteFill>
  ),
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1440 }) => (
    <div
      style={{
        ...paletteCssVariables({ accent, bg, fg }),
        width,
        padding: '96px 112px',
        background: `${bg}d9`,
        borderTop: `3px double ${fg}3a`,
        borderBottom: `3px double ${fg}3a`,
        borderLeft: `1px solid ${fg}1f`,
        borderRight: `1px solid ${fg}1f`,
        boxShadow: `inset 0 0 0 1px ${accent}1f`,
      }}
    >
      {children}
    </div>
  ),
  Chip: ({ accent, fg = BRAND_FG, index, size = 84 }) => (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'baseline',
        gap: size * 0.12,
      }}
    >
      <span
        style={{
          fontFamily: 'Instrument Serif',
          fontStyle: 'italic',
          fontSize: size,
          lineHeight: 0.9,
          color: accent,
        }}
      >
        {index}
      </span>
      <span
        style={{
          width: size * 0.42,
          height: 1,
          alignSelf: 'center',
          background: `${fg}40`,
        }}
      />
    </div>
  ),
};

/* ===================================================================== */
/*  Skin: Neo-brutalist                                                   */
/* ===================================================================== */

/**
 * Neo-brutalist: bold flat aesthetic — thick solid borders, hard offset drop
 * shadows (no blur), flat fills (no gradients/glass), oversized Bebas Neue
 * headings and high-contrast blocky chips. All colors come from the SkinChrome
 * props so it tracks the swappable palette system — no brand hex hardcoded. The
 * hard shadow color is derived from accent/fg at an alpha, never a fixed hex.
 */
const NeoBrutalist: BlockSkin = {
  id: 'neo-brutalist',
  name: 'Neo-brutalist',
  accent: BRAND_ACCENT,
  Background: ({ accent, bg = BRAND_BG, fg = BRAND_FG }) => (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      {/* Bold flat offset shapes — solid fills, thick borders, no blur. */}
      <div
        style={{
          position: 'absolute',
          top: -140,
          right: -120,
          width: 540,
          height: 540,
          background: `${accent}1f`,
          border: `12px solid ${fg}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -180,
          left: -120,
          width: 480,
          height: 480,
          background: `${fg}12`,
          border: `12px solid ${accent}`,
        }}
      />
      {/* Thick framing border. */}
      <div style={{ position: 'absolute', inset: 44, border: `10px solid ${fg}` }} />
    </AbsoluteFill>
  ),
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1440 }) => (
    <div
      style={{
        ...paletteCssVariables({ accent, bg, fg }),
        width,
        padding: '88px 96px',
        background: bg,
        border: `8px solid ${fg}`,
        // Hard offset shadow — zero blur — colored from accent at an alpha.
        boxShadow: `18px 18px 0 ${accent}cc`,
      }}
    >
      {children}
    </div>
  ),
  Chip: ({ accent, bg = BRAND_BG, fg = BRAND_FG, index, size = 72 }) => (
    <div
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Bebas Neue',
        fontSize: size * 0.66,
        color: bg,
        background: accent,
        border: `5px solid ${fg}`,
        // Hard offset shadow — zero blur — colored from fg at an alpha.
        boxShadow: `7px 7px 0 ${fg}cc`,
      }}
    >
      {index}
    </div>
  ),
};

/* ===================================================================== */
/*  Skin: Blueprint / Schematic                                          */
/* ===================================================================== */

/**
 * Technical-drawing aesthetic: a fine measured grid (a dense fine cell plus a
 * coarser major cell, both via GridOverlay), thin precise strokes, corner
 * tick/crop marks, monospace labels (JetBrains Mono), and a hairline/dashed
 * framed panel with measured corners — an engineering-drawing feel. Every
 * color is pulled from the SkinChrome props (accent/bg/fg) so it tracks the
 * swappable palette system — no brand hex hardcoded. Static chrome only: no CSS
 * transitions (they would be inert in rendered frames anyway).
 */

/** L-shaped crop/registration mark anchored to one corner of `inset`. */
const CropMark: React.FC<{
  corner: 'tl' | 'tr' | 'bl' | 'br';
  inset: number;
  arm: number;
  color: string;
  thickness?: number;
}> = ({ corner, inset, arm, color, thickness = 1.5 }) => {
  const isTop = corner === 'tl' || corner === 'tr';
  const isLeft = corner === 'tl' || corner === 'bl';
  const vPos = isTop ? { top: inset } : { bottom: inset };
  const hPos = isLeft ? { left: inset } : { right: inset };
  return (
    <>
      {/* horizontal arm */}
      <div
        style={{
          position: 'absolute',
          ...vPos,
          ...hPos,
          width: arm,
          height: thickness,
          background: color,
        }}
      />
      {/* vertical arm */}
      <div
        style={{
          position: 'absolute',
          ...vPos,
          ...hPos,
          width: thickness,
          height: arm,
          background: color,
        }}
      />
    </>
  );
};

const Blueprint: BlockSkin = {
  id: 'blueprint',
  name: 'Blueprint / Schematic',
  accent: BRAND_ACCENT,
  Background: ({ accent, bg = BRAND_BG, fg = BRAND_FG }) => (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      {/* Fine measured grid + coarser major grid — the drafting paper. */}
      <GridOverlay color={fg} opacity={0.07} cellSize={40} />
      <GridOverlay color={accent} opacity={0.12} cellSize={200} />
      {/* Outer hairline border frame with generous drafting margin. */}
      <div style={{ position: 'absolute', inset: 56, border: `1px solid ${fg}40` }} />
      {/* Inner dashed registration frame. */}
      <div
        style={{
          position: 'absolute',
          inset: 72,
          border: `1px dashed ${accent}4d`,
        }}
      />
      {/* Corner crop/tick marks straddling the frame. */}
      <CropMark corner="tl" inset={40} arm={44} color={accent} />
      <CropMark corner="tr" inset={40} arm={44} color={accent} />
      <CropMark corner="bl" inset={40} arm={44} color={accent} />
      <CropMark corner="br" inset={40} arm={44} color={accent} />
      {/* Top + bottom edge tick rulers (measured-scale feel). */}
      {Array.from({ length: 24 }, (_, i) => {
        const x = 96 + i * ((1920 - 192) / 23);
        const major = i % 4 === 0;
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: 'absolute',
                top: 56,
                left: x,
                width: 1,
                height: major ? 16 : 9,
                background: `${fg}${major ? '5a' : '33'}`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 56,
                left: x,
                width: 1,
                height: major ? 16 : 9,
                background: `${fg}${major ? '5a' : '33'}`,
              }}
            />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  ),
  Surface: ({ accent, bg = BRAND_BG, fg = BRAND_FG, children, width = 1380 }) => (
    <div style={{ ...paletteCssVariables({ accent, bg, fg }), position: 'relative', width }}>
      {/* Thin-stroke framed panel with a dashed inner rule. */}
      <div
        style={{
          width,
          padding: '84px 96px',
          background: `${bg}cc`,
          border: `1px solid ${fg}59`,
          boxShadow: `inset 0 0 0 1px ${bg}, inset 0 0 0 9px ${bg}, inset 0 0 0 10px ${accent}33`,
          position: 'relative',
        }}
      >
        {/* Measured corner ticks inside the panel. */}
        <CropMark corner="tl" inset={18} arm={26} color={accent} thickness={2} />
        <CropMark corner="tr" inset={18} arm={26} color={accent} thickness={2} />
        <CropMark corner="bl" inset={18} arm={26} color={accent} thickness={2} />
        <CropMark corner="br" inset={18} arm={26} color={accent} thickness={2} />
        {/* Dimension label on the top edge — schematic annotation. */}
        <div
          style={{
            position: 'absolute',
            top: -11,
            left: 96,
            padding: '0 10px',
            background: bg,
            fontFamily: 'JetBrains Mono',
            fontSize: 13,
            letterSpacing: 3,
            color: `${fg}99`,
          }}
        >
          {`FIG.\u2009${String(width)}\u2009\u00d7\u2009AUTO`}
        </div>
        {children}
      </div>
    </div>
  ),
  Chip: ({ accent, bg = BRAND_BG, fg = BRAND_FG, index, size = 56 }) => (
    <div
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'JetBrains Mono',
        fontSize: size * 0.42,
        color: accent,
        background: `${bg}cc`,
        border: `1px solid ${accent}80`,
      }}
    >
      {/* Tick marks on each side — measured marker. */}
      <div
        style={{
          position: 'absolute',
          top: -5,
          left: '50%',
          width: 1,
          height: 5,
          background: accent,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -5,
          left: '50%',
          width: 1,
          height: 5,
          background: accent,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -5,
          top: '50%',
          width: 5,
          height: 1,
          background: `${fg}66`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -5,
          top: '50%',
          width: 5,
          height: 1,
          background: `${fg}66`,
        }}
      />
      {String(index).padStart(2, '0')}
    </div>
  ),
};

/* ===================================================================== */
/*  Skin: EZ Coder workbench                                             */
/* ===================================================================== */

const EZCODER_SECONDARY = '#9b8cf7';

interface EzcoderNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  secondary: boolean;
}

const EZCODER_NODES: EzcoderNode[] = Array.from({ length: 22 }, (_, index) => ({
  id: `ezcoder-node-${index}`,
  x: 120 + random(`ezcoder-node-x-${index}`) * 1680,
  y: 80 + random(`ezcoder-node-y-${index}`) * 920,
  radius: 2 + random(`ezcoder-node-r-${index}`) * 2.5,
  secondary: random(`ezcoder-node-tone-${index}`) > 0.78,
}));

/**
 * Developer-tool backdrop taken from EZ Coder's home constellation: sparse
 * connected status nodes, cool charcoal depth, and a blue-to-periwinkle signal.
 * Motion is deliberately slow so the data block remains the focal point.
 */
const EzcoderBackground: React.FC<SkinChrome> = ({ accent, bg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const nodes = EZCODER_NODES.map((node, index) => ({
    ...node,
    x: node.x + Math.sin(time * 0.22 + index * 1.7) * 9,
    y: node.y + Math.cos(time * 0.18 + index * 1.3) * 7,
  }));
  const links: Array<{ key: string; a: EzcoderNode; b: EzcoderNode; opacity: number }> = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 310) continue;
      links.push({
        key: `${i}-${j}`,
        a,
        b,
        opacity: (1 - distance / 310) * 0.28,
      });
    }
  }

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        background: [
          `radial-gradient(circle at 18% 22%, ${accent}1f 0%, transparent 32%)`,
          `radial-gradient(circle at 82% 74%, ${EZCODER_SECONDARY}1c 0%, transparent 30%)`,
          bg,
        ].join(', '),
      }}
    >
      <svg width="100%" height="100%" style={{ opacity: 0.72 }} aria-hidden="true">
        {links.map((link) => (
          <line
            key={link.key}
            x1={link.a.x}
            y1={link.a.y}
            x2={link.b.x}
            y2={link.b.y}
            stroke={accent}
            strokeWidth={1.25}
            opacity={link.opacity}
          />
        ))}
        {nodes.map((node) => (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r={node.radius}
            fill={node.secondary ? EZCODER_SECONDARY : accent}
            opacity={node.secondary ? 0.9 : 0.76}
          />
        ))}
      </svg>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 72% 78% at 50% 50%, transparent 34%, ${bg}d9 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const EzcoderSurface: BlockSkin['Surface'] = ({ accent, bg, fg, children, width = 1440 }) => (
  <HeadingTypographyContext.Provider value={EZCODER_HEADING_TYPOGRAPHY}>
    <div
      style={{
        ...paletteCssVariables({ accent, bg, fg }),
        position: 'relative',
        width,
        overflow: 'hidden',
        borderRadius: 24,
        background: `linear-gradient(180deg, ${fg}08 0%, transparent 160px), ${bg}f2`,
        border: `1px solid ${fg}24`,
      }}
    >
      <div
        style={{
          height: 5,
          background: `linear-gradient(90deg, ${accent}, ${EZCODER_SECONDARY}, ${accent})`,
        }}
      />
      <div
        style={{
          height: 78,
          padding: '0 36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${fg}1f`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 18px ${accent}8c`,
            }}
          />
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 2.5,
              background: `linear-gradient(100deg, ${accent}, ${EZCODER_SECONDARY})`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            EZ CODER
          </span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 15, color: `${fg}73` }}>
            / OUTPUT
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 16px',
            borderRadius: 999,
            border: `1px solid ${accent}66`,
            background: `linear-gradient(180deg, ${accent}2e, ${accent}12)`,
            color: accent,
            fontFamily: 'JetBrains Mono',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 1.5,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
          READY
        </div>
      </div>
      <div style={{ padding: '64px 84px 76px' }}>{children}</div>
    </div>
  </HeadingTypographyContext.Provider>
);

const Ezcoder: BlockSkin = {
  id: 'ezcoder',
  name: 'EZ Coder',
  accent: '#4d9dff',
  Background: EzcoderBackground,
  Surface: EzcoderSurface,
  Chip: ({ accent, bg, fg, index, size = 62 }) => (
    <div
      style={{
        flexShrink: 0,
        minWidth: size,
        height: size,
        padding: `0 ${Math.round(size * 0.28)}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        border: `1px solid ${fg}2e`,
        background: `linear-gradient(180deg, ${accent}, ${EZCODER_SECONDARY})`,
        boxShadow: `0 1px 2px ${bg}80, inset 0 1px 0 ${fg}47`,
        color: '#f4f8ff',
        fontFamily: 'JetBrains Mono',
        fontSize: size * 0.42,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {String(index).padStart(2, '0')}
    </div>
  ),
};

export const SKINS = {
  'aurora-glass': AuroraGlass,
  editorial: Editorial,
  bento: Bento,
  terminal: Terminal,
  'print-magazine': PrintMagazine,
  'neo-brutalist': NeoBrutalist,
  blueprint: Blueprint,
  ezcoder: Ezcoder,
} as const;

export type SkinId = keyof typeof SKINS;

/* ===================================================================== */
/*  Skin geometry — single source of truth for responsive blocks          */
/* ===================================================================== */

/**
 * Usable *content* width inside each skin's Surface. Blocks read this to size
 * inner text and columns to the actual space available instead of bunching to
 * one corner on wider surfaces.
 *
 * Keep each value in sync with its `Surface` width and horizontal padding.
 */
export const SKIN_CONTENT_WIDTH: Record<SkinId, number> = {
  'aurora-glass': 1340 - 104 * 2, // 1132
  editorial: 1620 - 24 * 2, // 1572
  bento: 1480 - 80 * 2, // 1320
  terminal: 1320 - 72 * 2, // 1176
  'print-magazine': 1440 - 112 * 2, // 1216
  'neo-brutalist': 1440 - 96 * 2, // 1248
  blueprint: 1380 - 96 * 2, // 1188
  ezcoder: 1440 - 84 * 2, // 1272
};

/* ===================================================================== */
/*  Shared text chrome                                                    */
/* ===================================================================== */

export const Kicker: React.FC<{ children: string; accent?: string; maxWidth?: number }> = ({
  children,
  accent = BRAND_ACCENT,
  maxWidth = 1120,
}) => (
  <FitText
    maxWidth={maxWidth}
    maxFontSize={26}
    minFontSize={18}
    maxLines={2}
    charWidthRatio={CHAR_WIDTH_RATIO.mono}
    letterSpacing={3}
    style={{ fontFamily: 'JetBrains Mono', letterSpacing: 3, color: accent, marginBottom: 24 }}
  >
    {children}
  </FitText>
);

export const Heading: React.FC<{
  children: string;
  size?: number;
  fg?: string;
  maxWidth?: number;
}> = ({ children, size = 128, fg = BRAND_FG, maxWidth = 1120 }) => {
  const typography = React.useContext(HeadingTypographyContext);
  const maxFontSize = Math.round(size * typography.scale);

  return (
    <FitText
      maxWidth={maxWidth}
      maxFontSize={maxFontSize}
      minFontSize={Math.round(maxFontSize * 0.5)}
      maxLines={3}
      charWidthRatio={typography.charWidthRatio}
      letterSpacing={typography.letterSpacing}
      style={{
        fontFamily: typography.fontFamily,
        fontWeight: typography.fontWeight,
        lineHeight: typography.fontFamily === 'Geist' ? 1.08 : 0.95,
        color: fg,
        letterSpacing: typography.letterSpacing,
      }}
    >
      {children}
    </FitText>
  );
};

/* ===================================================================== */
/*  Palette resolution                                                    */
/* ===================================================================== */

/** Resolve a palette by id (searching custom then built-ins), brand fallback. */
export function resolvePalette(paletteId?: string, custom?: Palette[]): Palette {
  return getPaletteById(paletteId, custom);
}

/** Map a palette onto the skin chrome color triplet. */
export function paletteToChrome(p: Palette): { accent: string; bg: string; fg: string } {
  return { accent: p.accent, bg: p.background, fg: p.foreground };
}
