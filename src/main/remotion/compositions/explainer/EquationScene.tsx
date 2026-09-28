/**
 * Equation scene — "Consistency × Time = Results". Rounded term tiles spring
 * in on their beats, joined by large accent operator glyphs; on `resultAt` a
 * drawn "=" appears and the result tile lands bigger, accent-tinted and
 * glowing with one soft burst. Rows wrap (before an operator) when the whole
 * equation does not fit the stage width.
 *
 * Reaction targets: terms 0..n−1, result = n.
 */

import type React from 'react';
import { interpolate, spring } from 'remotion';
import {
  Burst,
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
import type { EquationScene as EquationSceneData } from './types';

const MAX_ROW = 960;
const TERM_FONT = 54;
const RESULT_FONT = 76;
const TERM_PAD_X = 38;
const RESULT_PAD_X = 46;
const OP_W = 104;
const EQ_W = 118;
const ROW_GAP = 44;

/** Rough Inter-bold advance width (em) per character, for line breaking. */
function charEm(c: string): number {
  if (c === ' ') return 0.28;
  if (/[iljtfr.,'!|:;]/.test(c)) return 0.34;
  if (/[mwMW]/.test(c)) return 0.9;
  if (/[A-Z]/.test(c)) return 0.7;
  if (/[0-9]/.test(c)) return 0.62;
  return 0.58;
}

function textWidth(text: string, size: number): number {
  let em = 0;
  for (const c of text) em += charEm(c);
  return em * size;
}

type Token =
  | { type: 'term'; index: number; width: number }
  | { type: 'op'; index: number; width: number }
  | { type: 'eq'; width: number }
  | { type: 'result'; width: number };

/** Group tokens into rows; an operator always starts the row with its term. */
function layoutRows(scene: EquationSceneData, scale: number): Token[][] {
  const termW = (text: string): number =>
    textWidth(text, TERM_FONT * scale) + TERM_PAD_X * 2 * scale;
  const units: Token[][] = scene.terms.map((term, i) => {
    const tile: Token = { type: 'term', index: i, width: termW(term.text) };
    return i === 0 ? [tile] : [{ type: 'op', index: i - 1, width: OP_W * scale }, tile];
  });
  units.push([
    { type: 'eq', width: EQ_W * scale },
    {
      type: 'result',
      width: textWidth(scene.result, RESULT_FONT * scale) + RESULT_PAD_X * 2 * scale,
    },
  ]);
  const rows: Token[][] = [];
  let row: Token[] = [];
  let w = 0;
  for (const unit of units) {
    const uw = unit.reduce((s, tk) => s + tk.width, 0);
    if (row.length > 0 && w + uw > MAX_ROW) {
      rows.push(row);
      row = [];
      w = 0;
    }
    row.push(...unit);
    w += uw;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/** Single row if it fits at ≥ 82% size, else wrapped rows at full size. */
function chooseLayout(scene: EquationSceneData): { rows: Token[][]; scale: number } {
  for (const scale of [1, 0.9, 0.82]) {
    const rows = layoutRows(scene, scale);
    if (rows.length === 1) return { rows, scale };
  }
  return { rows: layoutRows(scene, 1), scale: 1 };
}

function popSpring(frame: number, fps: number, atSec: number, stiffness = 170): number {
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { stiffness, damping: 14, mass: 0.9 },
  });
}

const TermTile: React.FC<{ text: string; index: number; at: number; scale: number }> = ({
  text,
  index,
  at,
  scale,
}) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const reaction = useReaction(index);
  const float = useFloat(`eq-term-${index}`, 5);
  const shadow = useLivingShadow(`eq-term-${index}`, 0.8);
  const pop = popSpring(frame, fps, at);
  const start = Math.round(at * fps);
  const appear = interpolate(frame, [start, start + 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const flash = t >= at ? Math.max(0, 1 - (t - at) / 0.8) : 0;
  return (
    <div
      style={{
        position: 'relative',
        opacity: appear,
        transform: `${floatTransform(float)} translateY(${((1 - pop) * 46).toFixed(2)}px) scale(${(0.72 + pop * 0.28).toFixed(4)}) ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={S.accentSoft} intensity={reaction.glow + flash * 0.6} radius={120} />
      <div
        style={{
          position: 'relative',
          padding: `${(24 * scale).toFixed(1)}px ${(TERM_PAD_X * scale).toFixed(1)}px`,
          borderRadius: 30 * scale,
          background: `linear-gradient(165deg, ${S.cardRaised} 0%, ${S.card} 100%)`,
          border: `1.5px solid ${mixHex(S.cardRaised, S.accent, 0.1 + flash * 0.5)}`,
          boxShadow: `${shadow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: TERM_FONT * scale,
          lineHeight: 1.12,
          letterSpacing: '-0.02em',
          color: S.text,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  );
};

const OpGlyph: React.FC<{ op: string; at: number; scale: number; seed: number }> = ({
  op,
  at,
  scale,
  seed,
}) => {
  const S = useStage();
  const { frame, fps } = useSceneTime();
  const float = useFloat(`eq-op-${seed}`, 4);
  const pop = popSpring(frame, fps, at, 220);
  return (
    <div
      style={{
        width: OP_W * scale,
        display: 'flex',
        justifyContent: 'center',
        fontFamily: S.font,
        fontWeight: 400,
        fontSize: 92 * scale,
        lineHeight: 1,
        color: S.accent,
        opacity: Math.min(1, pop * 1.4),
        transform: `${floatTransform(float)} scale(${(0.4 + pop * 0.6).toFixed(4)}) rotate(${((1 - pop) * -40).toFixed(2)}deg)`,
        textShadow: `0 0 26px ${withAlpha(S.accent, 0.55)}`,
      }}
    >
      {op}
    </div>
  );
};

/** "=" drawn as two bars that sweep in left → right. */
const EqualsGlyph: React.FC<{ at: number; scale: number }> = ({ at, scale }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const a = ramp(t, at, 0.35);
  const b = ramp(t, at + 0.08, 0.35);
  const barW = 58 * scale;
  const barH = 11 * scale;
  const h = 60 * scale;
  const bar = (p: number, top: number): React.ReactNode => (
    <div
      style={{
        position: 'absolute',
        left: (EQ_W * scale - barW) / 2,
        top,
        width: barW,
        height: barH,
        borderRadius: barH,
        background: S.accent,
        transformOrigin: 'left center',
        transform: `scaleX(${p.toFixed(4)})`,
        opacity: p > 0.001 ? 1 : 0,
        boxShadow: `0 0 20px ${withAlpha(S.accent, 0.6)}`,
      }}
    />
  );
  return (
    <div style={{ position: 'relative', width: EQ_W * scale, height: h }}>
      {bar(a, h / 2 - barH - 7 * scale)}
      {bar(b, h / 2 + 7 * scale)}
    </div>
  );
};

const ResultTile: React.FC<{ text: string; index: number; at: number; scale: number }> = ({
  text,
  index,
  at,
  scale,
}) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const reaction = useReaction(index);
  const float = useFloat('eq-result', 6);
  const breath = useBreath('eq-result');
  /** Lands with the "pop" cue (resultAt + 0.15 in kinds-ideas.ts). */
  const landAt = at + 0.15;
  const pop = spring({
    frame: frame - Math.round(landAt * fps),
    fps,
    config: { stiffness: 190, damping: 12, mass: 1 },
  });
  const shown = t >= landAt;
  const landed = ramp(t, landAt, 0.6);
  const glow = landed * (0.55 + breath * 0.35) + reaction.glow;
  const ink = mixHex(S.accent, '#ffffff', 0.4);
  // Faint dashed slot before the result lands, so the eye expects it.
  const ghost = (1 - Math.min(1, pop * 2)) * ramp(t, 0.2, 0.5) * 0.5;
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 34 * scale,
          border: `2.5px dashed ${withAlpha(S.muted, 0.6)}`,
          opacity: ghost,
        }}
      />
      <div
        style={{
          position: 'relative',
          opacity: shown ? Math.min(1, pop * 1.6) : 0,
          transform: `${floatTransform(float)} translateY(${((1 - pop) * -70).toFixed(2)}px) scale(${(0.6 + pop * 0.4).toFixed(4)}) ${reactionTransform(reaction)}`,
        }}
      >
        <Glow color={withAlpha(S.accent, 0.8)} intensity={glow} radius={200} />
        <div
          style={{
            position: 'relative',
            padding: `${(30 * scale).toFixed(1)}px ${(RESULT_PAD_X * scale).toFixed(1)}px`,
            borderRadius: 34 * scale,
            background: `linear-gradient(160deg, ${withAlpha(S.accent, 0.42)} 0%, ${withAlpha(S.accent, 0.16)} 100%), ${S.cardRaised}`,
            border: `2.5px solid ${withAlpha(S.accent, 0.85)}`,
            boxShadow: `0 30px 70px rgba(0,0,0,0.45), 0 0 ${(40 + breath * 30).toFixed(1)}px ${withAlpha(S.accent, 0.4)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: RESULT_FONT * scale,
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            color: ink,
            whiteSpace: 'nowrap',
            textShadow: `0 0 30px ${withAlpha(S.accent, 0.5)}`,
          }}
        >
          {text}
        </div>
        {/* Burst anchored on the tile centre. */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
          <Burst
            atSec={landAt}
            x={0}
            y={0}
            color={S.accent}
            seed="equation"
            radius={260 * scale}
            count={16}
          />
        </div>
      </div>
    </div>
  );
};

export const EquationScene: React.FC<{ scene: EquationSceneData }> = ({ scene }) => {
  const { rows, scale } = chooseLayout(scene);
  const n = scene.terms.length;

  const renderToken = (tk: Token): React.ReactNode => {
    switch (tk.type) {
      case 'term': {
        const term = scene.terms[tk.index];
        if (!term) return null;
        return (
          <TermTile
            key={`t${tk.index}`}
            text={term.text}
            index={tk.index}
            at={term.at}
            scale={scale}
          />
        );
      }
      case 'op': {
        // The operator arrives with the term it introduces.
        const next = scene.terms[tk.index + 1];
        const at = next?.at ?? scene.resultAt;
        return (
          <OpGlyph
            key={`o${tk.index}`}
            op={scene.ops[tk.index] ?? '+'}
            at={at}
            scale={scale}
            seed={tk.index}
          />
        );
      }
      case 'eq':
        return <EqualsGlyph key="eq" at={scene.resultAt} scale={scale} />;
      case 'result':
        return (
          <ResultTile key="res" text={scene.result} index={n} at={scene.resultAt} scale={scale} />
        );
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: ROW_GAP,
      }}
    >
      {rows.map((row, r) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          key={r}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {row.map(renderToken)}
          {/* Wrapped rows lead with an operator: mirror its width so the tile centres. */}
          {rows.length > 1 && row[0] && row[0].type !== 'term' && (
            <div style={{ width: row[0].width, flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
};
