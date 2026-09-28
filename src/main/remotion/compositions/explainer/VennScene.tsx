/**
 * Venn scene — two large translucent circles (accent left, accent2 right)
 * slide in from the sides on their beats and settle slightly apart. On the
 * centre beat they close the gap, the overlap lens lights up in a blend of
 * both colours and the "sweet spot" label pops in the middle with a burst.
 *
 * Reaction targets: 0 left circle, 1 right circle, 2 centre label.
 */

import type React from 'react';
import { useId } from 'react';
import { spring } from 'remotion';
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
import type { VennScene as VennSceneData } from './types';

const R = 290;
const CY = 470;
/** Final centre distance (overlap width = 2R − D). */
const D = 310;
/** Extra half-gap before the centre beat closes it. */
const PRE_GAP = 30;
const ENTER_SHIFT = 300;
const LABEL_W = 290;
const LABEL_DY = -70;

/** Label font: largest size (34–54) whose longest word fits the crescent. */
function labelFont(label: string): number {
  const longest = label.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 1);
  const oneLine = LABEL_W / Math.max(1, label.length * 0.54);
  if (oneLine >= 40) return Math.min(54, oneLine);
  return Math.max(34, Math.min(50, LABEL_W / (longest * 0.54)));
}

function slide(frame: number, fps: number, at: number): number {
  return spring({
    frame: frame - Math.round(at * fps),
    fps,
    config: { stiffness: 110, damping: 17, mass: 1 },
  });
}

const CircleLabel: React.FC<{
  label: string;
  x: number;
  opacity: number;
  seed: string;
  font: number;
}> = ({ label, x, opacity, seed, font }) => {
  const S = useStage();
  const float = useFloat(seed, 4);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - LABEL_W / 2,
        top: CY + LABEL_DY - 80,
        width: LABEL_W,
        height: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        textWrap: 'balance',
        opacity,
        transform: floatTransform(float),
        fontFamily: S.font,
        fontWeight: 750,
        fontSize: font,
        lineHeight: 1.08,
        letterSpacing: '-0.02em',
        color: S.text,
        textShadow: '0 4px 18px rgba(0,0,0,0.35)',
      }}
    >
      {label}
    </div>
  );
};

export const VennScene: React.FC<{ scene: VennSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const rawId = useId();
  const id = `venn${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const rLeft = useReaction(0);
  const rRight = useReaction(1);
  const rCenter = useReaction(2);
  const breath = useBreath('venn');
  const centerFloat = useFloat('venn-center', 5);
  const shadow = useLivingShadow('venn-center', 0.8);

  const inL = slide(frame, fps, scene.left.at);
  const inR = slide(frame, fps, scene.right.at);
  const merge = slide(frame, fps, scene.center.at);
  const gap = PRE_GAP * (1 - merge);
  const lx = 540 - D / 2 - gap - (1 - inL) * ENTER_SHIFT + rLeft.x;
  const rx = 540 + D / 2 + gap + (1 - inR) * ENTER_SHIFT + rRight.x;
  const lr = R * (0.9 + Math.min(1, inL) * 0.1) * rLeft.scale;
  const rr = R * (0.9 + Math.min(1, inR) * 0.1) * rRight.scale;
  const showL = t >= scene.left.at ? Math.min(1, inL * 1.5) : 0;
  const showR = t >= scene.right.at ? Math.min(1, inR * 1.5) : 0;

  const lit = ramp(t, scene.center.at, 0.6);
  const pop = spring({
    frame: frame - Math.round(scene.center.at * fps),
    fps,
    config: { stiffness: 200, damping: 12, mass: 0.9 },
  });
  const centerShown = t >= scene.center.at;
  const lensColor = mixHex(S.accent, S.accent2, 0.5);
  const lensGlow = lit * (0.75 + breath * 0.25);

  // One shared size so both circles read as equals.
  const labelSize = Math.min(labelFont(scene.left.label), labelFont(scene.right.label));
  // Crescent label centres (midway between outer edge and lens edge).
  const lLabelX = (lx - lr + (rx - rr)) / 2;
  const rLabelX = (rx + rr + (lx + lr)) / 2;

  const circle = (
    cx: number,
    r: number,
    color: string,
    gradId: string,
    glow: number,
  ): React.ReactNode => (
    <>
      <circle cx={cx} cy={CY} r={r} fill={`url(#${gradId})`} />
      <circle
        cx={cx}
        cy={CY}
        r={r - 1.5}
        fill="none"
        stroke={withAlpha(color, 0.75 + glow * 0.25)}
        strokeWidth={3 + glow * 2}
      />
    </>
  );

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Soft lens bloom behind everything. */}
      <svg
        width={1080}
        height={960}
        style={{
          position: 'absolute',
          inset: 0,
          filter: 'blur(40px)',
          opacity: lensGlow * 0.9,
        }}
      >
        <title>venn glow</title>
        <defs>
          <clipPath id={`${id}-glowclip`}>
            <circle cx={rx} cy={CY} r={rr} />
          </clipPath>
        </defs>
        <circle
          cx={lx}
          cy={CY}
          r={lr}
          fill={lensColor}
          clipPath={`url(#${id}-glowclip)`}
          opacity={showL * showR}
        />
      </svg>
      <svg
        width={1080}
        height={960}
        viewBox="0 0 1080 960"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        <title>venn</title>
        <defs>
          <radialGradient id={`${id}-gl`} cx="38%" cy="34%" r="75%">
            <stop offset="0%" stopColor={withAlpha(S.accent, 0.42)} />
            <stop offset="100%" stopColor={withAlpha(S.accent, 0.16)} />
          </radialGradient>
          <radialGradient id={`${id}-gr`} cx="62%" cy="34%" r="75%">
            <stop offset="0%" stopColor={withAlpha(S.accent2, 0.4)} />
            <stop offset="100%" stopColor={withAlpha(S.accent2, 0.14)} />
          </radialGradient>
          <linearGradient id={`${id}-lens`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={mixHex(S.accent, '#ffffff', 0.15)} />
            <stop offset="100%" stopColor={mixHex(S.accent2, '#ffffff', 0.1)} />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <circle cx={rx} cy={CY} r={rr} />
          </clipPath>
        </defs>
        <g opacity={showL}>{circle(lx, lr, S.accent, `${id}-gl`, rLeft.glow)}</g>
        <g opacity={showR}>{circle(rx, rr, S.accent2, `${id}-gr`, rRight.glow)}</g>
        {/* The overlap lens: left circle clipped by the right one. */}
        <circle
          cx={lx}
          cy={CY}
          r={lr}
          fill={`url(#${id}-lens)`}
          clipPath={`url(#${id}-clip)`}
          opacity={showL * showR * (0.12 + lit * 0.58)}
        />
      </svg>

      <CircleLabel
        label={scene.left.label}
        x={lLabelX}
        opacity={showL}
        seed="venn-l"
        font={labelSize}
      />
      <CircleLabel
        label={scene.right.label}
        x={rLabelX}
        opacity={showR}
        seed="venn-r"
        font={labelSize}
      />

      {/* Centre label. */}
      <div
        style={{
          position: 'absolute',
          left: 540 - 250,
          width: 500,
          top: CY + 30,
          height: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: centerShown ? Math.min(1, pop * 1.6) : 0,
          transform: `${floatTransform(centerFloat)} scale(${(0.55 + pop * 0.45).toFixed(4)}) ${reactionTransform(rCenter)}`,
        }}
      >
        <div style={{ position: 'relative' }}>
          <Glow
            color={withAlpha(lensColor, 0.8)}
            intensity={lit * 0.6 + rCenter.glow}
            radius={140}
          />
          <div
            style={{
              position: 'relative',
              padding: '18px 34px',
              borderRadius: 999,
              background: `linear-gradient(135deg, ${mixHex(S.bgOuter, S.accent, 0.32)} 0%, ${mixHex(S.bgOuter, S.accent2, 0.3)} 100%)`,
              border: `2px solid ${withAlpha(mixHex(lensColor, '#ffffff', 0.4), 0.75)}`,
              boxShadow: `${shadow}, 0 0 40px ${withAlpha(lensColor, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.14)`,
              fontFamily: S.font,
              fontWeight: 800,
              fontSize: scene.center.label.length > 11 ? 42 : 48,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: S.text,
              whiteSpace: 'nowrap',
            }}
          >
            {scene.center.label}
          </div>
        </div>
      </div>
      <Burst
        atSec={scene.center.at}
        x={540}
        y={CY + 85}
        color={lensColor}
        seed="venn"
        radius={240}
        count={14}
      />
    </div>
  );
};
