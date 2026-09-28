/**
 * Quadrant scene — a 2×2 matrix. Thin axes with arrowheads draw in (x along
 * the bottom, y up the left, each reading low → high), four soft cells fade
 * up, then each item drops into its cell as a pill on its beat. An optional
 * winning cell fills with the accent and glows on `winnerAt` while the other
 * cells step back.
 *
 * Cells: tl = low x / high y, tr = high x / high y, bl = low both,
 * br = high x / low y. Reaction targets: items in order.
 */

import type React from 'react';
import { spring } from 'remotion';
import {
  floatTransform,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { QuadrantCell, QuadrantScene as QuadrantSceneData } from './types';

/** Axis origin (bottom-left) and far ends on the 1080×960 stage. */
const GX0 = 176;
const GX1 = 1004;
const GY0 = 64;
const GY1 = 776;
const INSET = 18;
const GAP = 16;
const CELL_W = (GX1 - GX0 - INSET - GAP) / 2;
const CELL_H = (GY1 - GY0 - INSET - GAP) / 2;

function cellBox(cell: QuadrantCell): { x: number; y: number } {
  const col = cell === 'tl' || cell === 'bl' ? 0 : 1;
  const row = cell === 'tl' || cell === 'tr' ? 0 : 1;
  return { x: GX0 + INSET + col * (CELL_W + GAP), y: GY0 + row * (CELL_H + GAP) };
}

const CELLS: readonly QuadrantCell[] = ['tl', 'tr', 'bl', 'br'];

/** Font that keeps a pill on one line, or wraps it to two at a comfortable size. */
function pillFont(label: string): { size: number; wrapped: boolean } {
  const fit = (CELL_W - 124) / Math.max(1, label.length * 0.56);
  if (fit >= 38) return { size: Math.min(46, fit), wrapped: false };
  return { size: 42, wrapped: true };
}

const Axes: React.FC = () => {
  const S = useStage();
  const { t } = useSceneTime();
  const p = ramp(t, 0.05, 0.7);
  const head = ramp(t, 0.45, 0.35);
  const stroke = withAlpha(S.text, 0.55);
  return (
    <svg
      width={1080}
      height={960}
      viewBox="0 0 1080 960"
      style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
    >
      <title>axes</title>
      <path
        d={`M ${GX0} ${GY1} L ${GX0} ${GY0 - 18}`}
        pathLength={1}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray="1 1"
        strokeDashoffset={1 - p}
      />
      <path
        d={`M ${GX0} ${GY1} L ${GX1 + 18} ${GY1}`}
        pathLength={1}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray="1 1"
        strokeDashoffset={1 - p}
      />
      <path
        d={`M ${GX0 - 13} ${GY0 - 4} L ${GX0} ${GY0 - 20} L ${GX0 + 13} ${GY0 - 4}`}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={head}
      />
      <path
        d={`M ${GX1 + 4} ${GY1 - 13} L ${GX1 + 20} ${GY1} L ${GX1 + 4} ${GY1 + 13}`}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={head}
      />
    </svg>
  );
};

const AxisLabels: React.FC<{ xLabel: string; yLabel: string }> = ({ xLabel, yLabel }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const p = ramp(t, 0.3, 0.6);
  const small: React.CSSProperties = {
    fontFamily: S.font,
    fontWeight: 700,
    fontSize: 30,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: S.muted,
  };
  const name: React.CSSProperties = {
    fontFamily: S.font,
    fontWeight: 750,
    fontSize: 42,
    letterSpacing: '-0.01em',
    color: S.text,
    whiteSpace: 'nowrap',
  };
  const yLen = GY1 - GY0 - INSET;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: GX0 + INSET,
          width: GX1 - GX0 - INSET,
          top: GY1 + 22,
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: p,
          transform: `translateY(${((1 - p) * 14).toFixed(2)}px)`,
        }}
      >
        <span style={small}>Low</span>
        <span style={name}>{xLabel}</span>
        <span style={small}>High</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: GX0 - 52 - yLen / 2,
          top: GY0 + yLen / 2 - 30,
          width: yLen,
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transform: `rotate(-90deg) translateY(${((1 - p) * -14).toFixed(2)}px)`,
          opacity: p,
        }}
      >
        <span style={small}>Low</span>
        <span style={name}>{yLabel}</span>
        <span style={small}>High</span>
      </div>
    </>
  );
};

const Cell: React.FC<{
  cell: QuadrantCell;
  index: number;
  win: number;
  dim: number;
  landedAt: number | undefined;
}> = ({ cell, index, win, dim, landedAt }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const breath = useBreath(`quad-${cell}`);
  const { x, y } = cellBox(cell);
  const enter = ramp(t, 0.15 + index * 0.07, 0.6);
  // Brief light-up when an item lands in the cell.
  const flash = landedAt !== undefined && t >= landedAt ? Math.max(0, 1 - (t - landedAt) / 0.9) : 0;
  const border = mixHex(
    mixHex(S.card, S.text, 0.08),
    S.accent,
    Math.min(1, flash * 0.55 + win * 0.85),
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: CELL_W,
        height: CELL_H,
        opacity: enter * (1 - dim * 0.55),
        transform: `scale(${(0.96 + enter * 0.04).toFixed(4)})`,
      }}
    >
      <Glow color={withAlpha(S.accent, 0.7)} intensity={win * (0.45 + breath * 0.3)} radius={220} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 28,
          background: `linear-gradient(160deg, ${mixHex(S.card, S.accent, win * 0.22)} 0%, ${mixHex(S.card, S.bgOuter, 0.3 - win * 0.3)} 100%)`,
          border: `2px solid ${border}`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 ${(win * 60).toFixed(1)}px ${withAlpha(S.accent, 0.35 * win)}`,
        }}
      />
      {win > 0.01 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            background: S.accentSoft,
            opacity: win,
          }}
        />
      )}
    </div>
  );
};

const ItemPill: React.FC<{
  label: string;
  cell: QuadrantCell;
  at: number;
  index: number;
  win: number;
  dim: number;
}> = ({ label, cell, at, index, win, dim }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const reaction = useReaction(index);
  const float = useFloat(`quad-item-${index}`, 5);
  const shadow = useLivingShadow(`quad-item-${index}`, 0.8);
  const drop = spring({
    frame: frame - Math.round(at * fps),
    fps,
    config: { stiffness: 190, damping: 13, mass: 0.9 },
  });
  if (t < at) return null;
  const { x, y } = cellBox(cell);
  const { size: font, wrapped } = pillFont(label);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: CELL_W,
        height: CELL_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: Math.min(1, drop * 2) * (1 - dim * 0.5),
        transform: `translateY(${((1 - drop) * -120).toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          position: 'relative',
          transform: `${floatTransform(float)} scale(${(0.88 + Math.min(1, drop) * 0.12).toFixed(4)}) ${reactionTransform(reaction)}`,
        }}
      >
        <Glow color={S.accentSoft} intensity={reaction.glow} radius={110} />
        <div
          style={{
            position: 'relative',
            maxWidth: CELL_W - 44,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: wrapped ? '18px 34px' : '18px 30px',
            borderRadius: 30,
            background: mixHex(S.cardRaised, S.accent, win * 0.3),
            border: `2px solid ${win > 0.01 ? withAlpha(S.accent, 0.4 + win * 0.5) : S.cardBorder}`,
            boxShadow: `${shadow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
            fontFamily: S.font,
            fontWeight: 700,
            fontSize: font,
            lineHeight: 1.12,
            letterSpacing: '-0.015em',
            color: S.text,
            textAlign: 'center',
            textWrap: 'balance',
          }}
        >
          {!wrapped && (
            <span
              style={{
                flexShrink: 0,
                width: 14,
                height: 14,
                borderRadius: 7,
                background: S.accent,
                boxShadow: `0 0 12px ${S.accent}`,
              }}
            />
          )}
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
};

export const QuadrantScene: React.FC<{ scene: QuadrantSceneData }> = ({ scene }) => {
  const { t } = useSceneTime();
  const winnerAt = scene.winner !== undefined ? scene.winnerAt : undefined;
  const win = winnerAt === undefined ? 0 : ramp(t, winnerAt, 0.6);
  const winFor = (c: QuadrantCell): number => (c === scene.winner ? win : 0);
  const dimFor = (c: QuadrantCell): number => (c === scene.winner ? 0 : win);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {CELLS.map((c, i) => (
        <Cell
          key={c}
          cell={c}
          index={i}
          win={winFor(c)}
          dim={dimFor(c)}
          landedAt={scene.items.find((it) => it.cell === c)?.at}
        />
      ))}
      <Axes />
      <AxisLabels xLabel={scene.xLabel} yLabel={scene.yLabel} />
      {scene.items.map((it, i) => (
        <ItemPill
          key={`${it.cell}-${it.label}`}
          label={it.label}
          cell={it.cell}
          at={it.at}
          index={i}
          win={winFor(it.cell)}
          dim={dimFor(it.cell)}
        />
      ))}
    </div>
  );
};
