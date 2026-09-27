/**
 * Number scene — a figure counts up on rolling digit columns from `countAt`,
 * decelerates into `landAt`, then lands with an overshoot bounce, a subtle
 * burst and a breathing glow. Prefix/suffix sit in the accent colour; a short
 * label sits under the figure.
 *
 * Motion adapted from Remocn rolling-number (MIT).
 */

import type React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
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
import { withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { NumberScene as NumberSceneData } from './types';

const DIGIT_EM = 0.64;
const SEP_EM = 0.28;
const CELL_EM = 1.12;
const COUNT_EASE = Easing.out(Easing.cubic);
/** Leading places fade/grow in as the count passes 40% of their threshold. */
const REVEAL_BAND = 0.4;

function wrap10(v: number): number {
  return ((v % 10) + 10) % 10;
}

/** Short symbols ("$", "%", "x", "k") sit big; words (" hrs") sit small. */
function affixScale(a: string): number {
  return a.trim().length <= 1 ? 0.72 : 0.36;
}

function affixEm(a: string | undefined): number {
  if (!a) return 0;
  const s = affixScale(a);
  return a.trim().length * 0.6 * s + 0.08;
}

const DigitColumn: React.FC<{
  pos: number;
  prevPos: number;
  reveal: number;
  fontSize: number;
}> = ({ pos, prevPos, reveal, fontSize }) => {
  const cell = fontSize * CELL_EM;
  // Velocity blur on the spinning column (vertical smear feel).
  const speed = Math.abs(pos - prevPos) * cell;
  const blur = Math.min(9, Math.max(0, speed * 0.03 - 0.4));
  const v = wrap10(pos);
  return (
    <span
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        height: cell,
        width: `${(DIGIT_EM * reveal).toFixed(4)}em`,
        opacity: reveal,
        transform: `translateY(${((1 - reveal) * fontSize * 0.3).toFixed(2)}px)`,
        textAlign: 'center',
        // Soft top/bottom fade so neighbouring digits roll in and out of view.
        maskImage:
          'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${(-v * cell).toFixed(2)}px)`,
          filter: blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 0-9-0 strip
          <span key={i} style={{ height: cell, lineHeight: `${cell}px` }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
};

export const NumberScene: React.FC<{ scene: NumberSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = useFloat('number', 6);
  const labelFloat = useFloat('number-label', 4);
  const shadow = useLivingShadow('number', 0.8);
  const breath = useBreath('number');
  const reaction = useReaction(0);

  const decimals = Math.max(0, Math.min(2, Math.round(scene.decimals ?? 0)));
  const target = Math.max(0, Math.round(scene.value * 10 ** decimals));
  const places = Math.max(String(target).length, decimals + 1);
  const countAt = scene.countAt;
  const landAt = Math.max(scene.landAt, countAt + 0.2);

  const progressAt = (f: number): number =>
    interpolate(f / fps, [countAt, landAt], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: COUNT_EASE,
    });
  const e = progressAt(frame);
  const ePrev = progressAt(frame - 1);
  const current = e * target;

  // Size the figure so the widest state fits the stage.
  const seps = Math.max(0, Math.floor((places - decimals - 1) / 3)) + (decimals > 0 ? 1 : 0);
  const totalEm = places * DIGIT_EM + seps * SEP_EM + affixEm(scene.prefix) + affixEm(scene.suffix);
  const fontSize = Math.min(340, 900 / totalEm);
  const cell = fontSize * CELL_EM;

  const cells: React.ReactNode[] = [];
  for (let p = 0; p < places; p++) {
    const pow = 10 ** p;
    const intPlace = p - decimals;
    // Places up to the integer ones place are always shown ("0.5", "0").
    const reveal =
      intPlace <= 0
        ? 1
        : interpolate(current, [pow * REVEAL_BAND, pow], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.inOut(Easing.sin),
          });
    const travel = Math.floor(target / pow);
    if (decimals > 0 && p === decimals) {
      cells.unshift(
        <span
          key="dot"
          style={{
            display: 'inline-block',
            width: `${SEP_EM}em`,
            height: cell,
            lineHeight: `${cell}px`,
            textAlign: 'center',
          }}
        >
          .
        </span>,
      );
    }
    if (intPlace > 0 && intPlace % 3 === 0) {
      cells.unshift(
        <span
          key={`s${p}`}
          style={{
            display: 'inline-block',
            width: `${(SEP_EM * reveal).toFixed(4)}em`,
            height: cell,
            opacity: reveal,
            lineHeight: `${cell}px`,
            textAlign: 'center',
          }}
        >
          ,
        </span>,
      );
    }
    cells.unshift(
      <DigitColumn
        key={`d${p}`}
        pos={e * travel}
        prevPos={ePrev * travel}
        reveal={reveal}
        fontSize={fontSize}
      />,
    );
  }

  // Entrance, then the landing bounce: a damped oscillation on the land beat.
  const enter = ramp(t, 0.05, 0.5);
  const k = frame - Math.round(landAt * fps);
  const bounce = k >= 0 ? Math.exp(-k / 7) * Math.sin(k * 0.5) * 0.11 : 0;
  // A tiny anticipation squeeze while the count decelerates.
  const tension = e > 0 && e < 1 ? Math.sin(e * Math.PI) * 0.02 : 0;
  const scale = (0.92 + enter * 0.08) * (1 + bounce + tension);
  const landed = ramp(t, landAt, 0.5);
  const glow = 0.15 + e * 0.25 + landed * (0.25 + breath * 0.3) + reaction.glow;
  const labelIn = ramp(t, 0.25, 0.55);
  const centerY = 400;

  const affix = (a: string | undefined, side: 'pre' | 'post'): React.ReactNode => {
    if (!a) return null;
    const s = affixScale(a);
    return (
      <span
        style={{
          fontSize: fontSize * s,
          lineHeight: `${cell}px`,
          height: cell,
          color: S.accent,
          display: 'inline-block',
          fontWeight: s < 0.5 ? 700 : 800,
          marginLeft: side === 'post' ? '0.04em' : 0,
          marginRight: side === 'pre' ? '0.04em' : 0,
          alignSelf: s < 0.5 ? 'flex-end' : undefined,
          paddingBottom: s < 0.5 ? fontSize * 0.14 : 0,
          letterSpacing: s < 0.5 ? '0' : '-0.03em',
          whiteSpace: 'pre',
        }}
      >
        {a}
      </span>
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: centerY - cell / 2,
          height: cell,
          display: 'flex',
          justifyContent: 'center',
          opacity: enter,
          transform: `${floatTransform(float)} scale(${scale.toFixed(4)}) ${reactionTransform(reaction)}`,
          transformOrigin: '50% 60%',
        }}
      >
        <div style={{ position: 'relative', display: 'flex' }}>
          <Glow color={withAlpha(S.accent, 0.6)} intensity={glow} radius={fontSize * 0.9} />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              fontFamily: S.font,
              fontWeight: 800,
              fontSize,
              color: S.text,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.03em',
              textShadow: `0 ${(fontSize * 0.08).toFixed(1)}px ${(fontSize * 0.22).toFixed(1)}px rgba(0,0,0,0.35)`,
            }}
          >
            {affix(scene.prefix, 'pre')}
            {cells}
            {affix(scene.suffix, 'post')}
          </div>
        </div>
      </div>
      <Burst
        atSec={landAt}
        x={540}
        y={centerY}
        color={S.accent}
        seed="number"
        radius={Math.min(360, fontSize * 1.3)}
        count={16}
      />
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: centerY + cell / 2 + 40,
          display: 'flex',
          justifyContent: 'center',
          opacity: labelIn,
          transform: `translateY(${((1 - labelIn) * 26).toFixed(2)}px) ${floatTransform(labelFloat)}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '16px 34px',
            borderRadius: 999,
            background: S.cardRaised,
            border: `1px solid ${S.cardBorder}`,
            boxShadow: shadow,
            fontFamily: S.font,
            fontWeight: 650,
            fontSize: 50,
            color: S.text,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: S.accent,
              boxShadow: `0 0 ${(10 + landed * 14).toFixed(1)}px ${S.accent}`,
              opacity: 0.5 + landed * 0.5,
            }}
          />
          {scene.label}
        </div>
      </div>
    </div>
  );
};
