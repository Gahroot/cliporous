/**
 * Pictogram scene — "1 in 4 people": a grid of person figures, all muted.
 * From `fillAt` the first `filled` figures light up in the accent one by one
 * (a quick reading-order stagger that finishes ~0.9 s later, on the spec's
 * pop). The headline stat rises in on `fillAt` and bounces on the pop; the
 * caption sits with it from the entrance.
 *
 * Layout adapts to `total`: small counts get big figures under the headline,
 * large grids (≈ 50–100) sit beside it so the figures stay readable.
 */

import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Burst, floatTransform, Glow, useBreath, useFloat } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { PictogramScene as PictogramSceneData } from './types';

/** Same timing as the `pop` cue (fillAt + 0.9) in src/main/ai/explainer/kinds-money.ts. */
const FILL_DONE_SEC = 0.9;
/** Figure aspect: height = width × FIG_RATIO (SVG viewBox 60×90). */
const FIG_RATIO = 1.5;
const GAP_RATIO = 0.22;

interface GridFit {
  cols: number;
  rows: number;
  cell: number;
}

/** Largest figure width for `total` figures inside a w×h box. */
function fitGrid(total: number, w: number, h: number): GridFit {
  let best: GridFit = { cols: total, rows: 1, cell: 0 };
  let bestScore = -1;
  for (let cols = 1; cols <= total; cols++) {
    const rows = Math.ceil(total / cols);
    const cellW = w / (cols + GAP_RATIO * (cols - 1));
    const cellH = h / (rows * FIG_RATIO + GAP_RATIO * (rows - 1));
    const cell = Math.min(cellW, cellH, 150);
    // Prefer full rows (a ragged last row reads as noise in a data graphic).
    // Among equal sizes, fewer rows (wider rows) read better.
    const score = cell * (total % cols === 0 ? 1 : 0.72) * (1 - rows * 0.004);
    if (score > bestScore) {
      bestScore = score;
      best = { cols, rows, cell };
    }
  }
  return best;
}

const Figure: React.FC<{ size: number; litAt: number | null; index: number }> = ({
  size,
  litAt,
  index,
}) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pop = usePop(litAt ?? 1e6, 260, 13);
  const lit = litAt !== null && t >= litAt;
  const k = lit ? Math.min(1, pop) : 0;
  const scale = lit ? 0.7 + 0.3 * pop : 1;
  const off = mixHex(S.cardRaised, S.muted, 0.28);
  const fill = mixHex(off, S.accent, k);
  // Muted figures breathe very slightly out of phase so the grid is alive.
  const idle = 0.88 + 0.12 * Math.sin(t * 1.6 + index * 0.7);
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size * FIG_RATIO}
      viewBox="0 0 60 90"
      style={{
        display: 'block',
        overflow: 'visible',
        transform: `scale(${scale.toFixed(4)})`,
        transformOrigin: '50% 70%',
        opacity: lit ? 1 : idle,
        filter:
          lit && size > 40
            ? `drop-shadow(0 0 ${(size * 0.14).toFixed(1)}px ${withAlpha(S.accent, 0.55 * k)})`
            : undefined,
      }}
    >
      <circle cx={30} cy={17} r={14} fill={fill} />
      <rect x={7} y={37} width={46} height={53} rx={21} fill={fill} />
    </svg>
  );
};

export const PictogramScene: React.FC<{ scene: PictogramSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = useFloat('pictogram', 5);
  const headFloat = useFloat('pictogram-head', 4);
  const breath = useBreath('pictogram');

  const total = Math.max(1, Math.min(100, Math.round(scene.total)));
  const filled = Math.max(0, Math.min(total, Math.round(scene.filled)));
  const fillAt = scene.fillAt;
  const doneAt = fillAt + FILL_DONE_SEC;

  // Two candidate layouts: headline on top (wide grid) or beside (tall grid).
  const topFit = fitGrid(total, 900, 520);
  const sideFit = fitGrid(total, 540, 800);
  const sideways = sideFit.cell > topFit.cell * 1.1;
  const grid = sideways ? sideFit : topFit;
  const fig = Math.floor(grid.cell);
  const gap = Math.round(fig * GAP_RATIO);
  const gridW = grid.cols * fig + (grid.cols - 1) * gap;
  const gridH = grid.rows * fig * FIG_RATIO + (grid.rows - 1) * gap;

  // Stagger: figure i lights between fillAt and just before the pop so the
  // last one has settled when the pop cue plays.
  const litAt = (i: number): number | null => {
    if (i >= filled) return null;
    const span = FILL_DONE_SEC - 0.22;
    return filled <= 1 ? fillAt : fillAt + (i / (filled - 1)) * span;
  };

  const enter = ramp(t, 0.05, 0.5);
  const statIn = usePop(fillAt, 170, 16);
  const k = frame - Math.round(doneAt * fps);
  const bounce = k >= 0 ? Math.exp(-k / 6) * Math.sin(k * 0.55) * 0.09 : 0;
  const landed = ramp(t, doneAt, 0.5);
  const statScale = (0.86 + 0.14 * statIn) * (1 + bounce);
  const statSize = scene.stat.length <= 4 ? 150 : scene.stat.length <= 6 ? 128 : 108;
  const labelSize = scene.label.length <= 18 ? 50 : 44;

  const headline = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: sideways ? 'flex-start' : 'center',
        gap: 8,
        transform: floatTransform(headFloat),
        maxWidth: sideways ? 340 : 900,
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'relative' }}>
        <Glow
          color={withAlpha(S.accent, 0.6)}
          intensity={landed * (0.35 + breath * 0.3)}
          radius={statSize}
        />
        <div
          style={{
            position: 'relative',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: statSize,
            lineHeight: 1,
            letterSpacing: '-0.035em',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            color: mixHex(S.text, S.accent, landed),
            opacity: Math.min(1, statIn * 1.4),
            transform: `translateY(${((1 - statIn) * 26).toFixed(2)}px) scale(${statScale.toFixed(4)})`,
            transformOrigin: sideways ? '0% 60%' : '50% 60%',
            textShadow: '0 10px 32px rgba(0,0,0,0.35)',
          }}
        >
          {scene.stat}
        </div>
      </div>
      <div
        style={{
          fontFamily: S.font,
          fontWeight: 600,
          fontSize: labelSize,
          lineHeight: 1.15,
          color: S.muted,
          textAlign: sideways ? 'left' : 'center',
          opacity: enter,
          transform: `translateY(${((1 - enter) * 18).toFixed(2)}px)`,
        }}
      >
        {scene.label}
      </div>
    </div>
  );

  const figures = (
    <div
      style={{
        position: 'relative',
        width: gridW,
        height: gridH,
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${grid.cols}, ${fig}px)`,
        gap,
        justifyContent: 'center',
        opacity: enter,
        transform: `translateY(${((1 - enter) * 30).toFixed(2)}px) ${floatTransform(float)}`,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size figure grid
        <Figure key={i} size={fig} litAt={litAt(i)} index={i} />
      ))}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: sideways ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sideways ? 56 : 48,
        padding: 60,
      }}
    >
      {headline}
      {figures}
      {filled > 0 && (
        <Burst
          atSec={doneAt}
          x={sideways ? 250 : 540}
          y={sideways ? 430 : 200}
          color={S.accent}
          seed="pictogram"
          radius={200}
          count={12}
        />
      )}
    </div>
  );
};
