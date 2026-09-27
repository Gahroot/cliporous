/**
 * Loop scene — 2–5 stage pills sit around a ring, joined by curved arc arrows
 * that draw in as each stage lands. From `spinAt` a glowing comet (with a
 * fading tail) circles the ring continuously while the ring slowly rotates;
 * labels stay upright. Optional serif centre label.
 */

import type React from 'react';
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
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { LoopScene as LoopSceneData } from './types';

type Stage = LoopSceneData['stages'][number];

const CX = 540;
const CY = 480;
const R = 310;
const PILL_H = 88;
const FONT = 38;
const RING_DEG_PER_SEC = 12;
const COMET_DEG_PER_SEC = 110;
const DEG = Math.PI / 180;

function pillWidth(label: string): number {
  return Math.min(400, 100 + label.length * FONT * 0.6);
}

function ptAt(angleDeg: number, r = R): { x: number; y: number } {
  return { x: CX + Math.cos(angleDeg * DEG) * r, y: CY + Math.sin(angleDeg * DEG) * r };
}

/** Smallest angle offset (deg) at which the ring leaves a pill centred at `angleDeg`. */
function exitDeg(angleDeg: number, w: number, dir: 1 | -1): number {
  const c = ptAt(angleDeg);
  const hw = w / 2 + 14;
  const hh = PILL_H / 2 + 14;
  for (let d = 1; d < 90; d++) {
    const p = ptAt(angleDeg + d * dir);
    if (Math.abs(p.x - c.x) > hw || Math.abs(p.y - c.y) > hh) return d;
  }
  return 90;
}

/** Eased time since spin start: smooth acceleration, then constant speed. */
function spinTime(t: number, spinAt: number): number {
  const s = t - spinAt;
  if (s <= 0) return 0;
  const acc = 0.8;
  return s < acc ? (s * s) / (2 * acc) : s - acc / 2;
}

const StagePill: React.FC<{ stage: Stage; index: number; angle: number; lit: number }> = ({
  stage,
  index,
  angle,
  lit,
}) => {
  const S = useStage();
  const pop = usePop(stage.at, 210, 13);
  const reaction = useReaction(index);
  const float = useFloat(`loop-stage-${index}`, 5);
  const shadow = useLivingShadow(`loop-stage-${index}`, 0.9);
  if (pop <= 0.001) return null;
  const w = pillWidth(stage.label);
  const c = ptAt(angle);
  const glow = Math.max(lit, reaction.glow);
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x - w / 2,
        top: c.y - PILL_H / 2,
        width: w,
        height: PILL_H,
        opacity: Math.min(1, pop * 1.6),
        transform: `${floatTransform(float)} scale(${(0.5 + 0.5 * pop).toFixed(4)}) ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={S.accentSoft} intensity={glow} radius={120} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: `linear-gradient(180deg, ${mixHex(S.cardRaised, S.text, 0.06)} 0%, ${S.cardRaised} 100%)`,
          border: `2px solid ${glow > 0.05 ? withAlpha(S.accent, 0.3 + 0.6 * Math.min(1, glow)) : S.cardBorder}`,
          boxShadow: `${shadow}, inset 0 2px 0 ${withAlpha(S.text, 0.08)}`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 26px 0 16px',
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            flexShrink: 0,
            background: mixHex(S.accent, S.cardRaised, 0.2 + 0.6 * (1 - Math.min(1, glow))),
            color: '#ffffff',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {index + 1}
        </div>
        <span
          style={{
            fontFamily: S.font,
            fontWeight: 700,
            fontSize: FONT,
            color: S.text,
            whiteSpace: 'nowrap',
          }}
        >
          {stage.label}
        </span>
      </div>
    </div>
  );
};

const Center: React.FC<{ label: string; at: number }> = ({ label, at }) => {
  const S = useStage();
  const pop = usePop(at, 160, 14);
  const breath = useBreath('loop-center');
  const float = useFloat('loop-center', 4);
  const reaction = useReaction(undefined);
  if (pop <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: CX - 190,
        top: CY - 70,
        width: 380,
        height: 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: Math.min(1, pop * 1.5),
        transform: `${floatTransform(float)} scale(${(0.7 + 0.3 * pop).toFixed(4)}) ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={S.accentSoft} intensity={0.4 + 0.35 * breath + reaction.glow} radius={160} />
      <span
        style={{
          position: 'relative',
          fontFamily: S.serif,
          fontStyle: 'italic',
          fontSize: label.length > 10 ? 62 : 80,
          lineHeight: 1,
          color: S.text,
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
};

export const LoopScene: React.FC<{ scene: LoopSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const stages = scene.stages;
  const n = stages.length;
  const st = spinTime(t, scene.spinAt);
  const rot = st * RING_DEG_PER_SEC;
  const angles = stages.map((_, i) => -90 + (i * 360) / Math.max(1, n) + rot);
  const widths = stages.map((s) => pillWidth(s.label));
  const firstAt = n > 0 ? Math.min(...stages.map((s) => s.at)) : 0.2;

  // Comet: travels clockwise from stage 0, on top of the ring rotation.
  const cometOn = ramp(t, scene.spinAt, 0.4);
  const cometDeg = -90 + rot + st * COMET_DEG_PER_SEC;
  const litFor = (a: number): number => {
    if (cometOn <= 0) return 0;
    const d = Math.abs(((((cometDeg - a) % 360) + 540) % 360) - 180);
    return Math.max(0, 1 - d / 28) * cometOn;
  };

  const arcs = stages.map((_, i) => {
    const j = (i + 1) % n;
    const drawAt = j === 0 ? stages[n - 1].at + 0.35 : stages[j].at - 0.05;
    const p = ramp(t, drawAt, 0.5);
    const a0 = angles[i] + exitDeg(angles[i], widths[i], 1);
    let a1 = angles[j] - exitDeg(angles[j], widths[j], -1);
    while (a1 <= a0) a1 += 360;
    if (n === 1) a1 = a0 + 300;
    return { i, a0, a1, p };
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg
        width={1080}
        height={960}
        viewBox="0 0 1080 960"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        aria-hidden="true"
      >
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={withAlpha(S.text, 0.07)}
          strokeWidth={2}
          opacity={ramp(t, Math.max(0, firstAt - 0.3), 0.5)}
        />
        {arcs.map(({ i, a0, a1, p }) => {
          if (p <= 0) return null;
          const s = ptAt(a0);
          const e = ptAt(a1);
          const large = a1 - a0 > 180 ? 1 : 0;
          const d = `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
          const head = Math.max(0, (p - 0.75) / 0.25);
          const tip = ptAt(a1 - 5 * (1 - p));
          const tangent = a1 + 90;
          return (
            <g key={`arc-${i}`}>
              <path
                d={d}
                fill="none"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - p}
                stroke={S.accent}
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.85}
              />
              {head > 0 && (
                <polygon
                  points="6,0 -14,-12 -14,12"
                  fill={S.accent}
                  transform={`translate(${tip.x.toFixed(2)} ${tip.y.toFixed(2)}) rotate(${tangent.toFixed(2)}) scale(${head.toFixed(3)})`}
                />
              )}
            </g>
          );
        })}
        {cometOn > 0 &&
          [6, 5, 4, 3, 2, 1, 0].map((k) => {
            const p = ptAt(cometDeg - k * 5);
            const fall = 1 - k / 7;
            return (
              <g key={`comet-${k}`} opacity={cometOn * fall}>
                {k === 0 && <circle cx={p.x} cy={p.y} r={28} fill={S.accent} opacity={0.18} />}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={k === 0 ? 14 : 11 * fall}
                  fill={S.accent}
                  opacity={k === 0 ? 0.6 : 0.55}
                />
                {k === 0 && <circle cx={p.x} cy={p.y} r={7} fill="#ffffff" />}
              </g>
            );
          })}
      </svg>
      {scene.center && <Center label={scene.center} at={Math.max(0.05, firstAt - 0.3)} />}
      {stages.map((s, i) => (
        <StagePill
          key={`${s.at}-${s.label}`}
          stage={s}
          index={i}
          angle={angles[i]}
          lit={Math.max(litFor(angles[i]), t >= s.at && t < s.at + 1 ? 1 - (t - s.at) : 0)}
        />
      ))}
      <Burst atSec={scene.spinAt} x={CX} y={CY} color={S.accent} radius={160} seed="loop-spin" />
    </div>
  );
};
