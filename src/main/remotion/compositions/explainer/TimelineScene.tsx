/**
 * Timeline scene — "first… then… finally". Dots sit on a horizontal line; the
 * accent line draws toward each dot so it arrives ON the step's beat, the dot
 * pops (overshoot + ring pulse + glow) and the step card under it lights up.
 */

import type React from 'react';
import { interpolate } from 'remotion';
import {
  EASE_IN_OUT_SOFT,
  floatTransform,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { withAlpha } from './palette';
import { ramp, shade, usePop, useSceneTime, useStage } from './stage';
import type { TimelineScene as TimelineSceneData } from './types';

const LINE_Y = 390;
const CARD_TOP = 486;
/** How long the line takes to travel into a dot (seconds). */
const DRAW_SEC = 0.55;
const LEAD = 70;

function xsFor(n: number): number[] {
  const [a, b] = n <= 2 ? [270, 810] : n === 3 ? [200, 880] : [150, 930];
  return Array.from({ length: n }, (_, i) => (n === 1 ? 540 : a + ((b - a) * i) / (n - 1)));
}

/** X of the drawn accent line's tip at time `t`. */
function fillX(t: number, xs: readonly number[], ats: readonly number[]): number {
  let x = (xs[0] ?? 0) - LEAD;
  for (let i = 0; i < xs.length; i++) {
    const from = i === 0 ? (xs[0] ?? 0) - LEAD : (xs[i - 1] ?? 0);
    const to = xs[i] ?? 0;
    const at = ats[i] ?? 0;
    const prevAt = i === 0 ? 0 : (ats[i - 1] ?? 0);
    const start = Math.max(prevAt, at - DRAW_SEC);
    if (t <= start) break;
    const p = at - start < 0.01 ? 1 : Math.min(1, (t - start) / (at - start));
    x = from + (to - from) * EASE_IN_OUT_SOFT(p);
    if (p < 1) break;
  }
  return x;
}

const Step: React.FC<{
  label: string;
  at: number;
  index: number;
  x: number;
  width: number;
  fontSize: number;
  current: boolean;
}> = ({ label, at, index, x, width, fontSize, current }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const cardFloat = useFloat(`timeline-card${index}`, 5);
  const shadow = useLivingShadow(`timeline-card${index}`, 0.8);
  const breath = useBreath(`timeline${index}`);
  const enter = ramp(t, 0.15 + index * 0.08, 0.5);
  const pop = usePop(at, 260, 12);
  const lit = t >= at;
  const litP = ramp(t, at, 0.4);
  const since = t - at;
  const ring = since >= 0 && since < 0.8 ? since / 0.8 : 0;

  const dot = 30 + 14 * Math.min(pop, 1.2);
  const glow = (lit ? (current ? 0.55 + breath * 0.35 : 0.25) : 0) + reaction.glow;
  const cardLift = litP * -8 + (1 - enter) * 30;
  const cardScale = 0.96 + 0.04 * enter + Math.sin(Math.min(pop, 1) * Math.PI) * 0.03;

  return (
    <>
      {/* Dot */}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: LINE_Y,
          width: 0,
          height: 0,
          transform: reactionTransform(reaction),
          opacity: enter,
        }}
      >
        <div style={{ position: 'absolute', left: -60, top: -60, width: 120, height: 120 }}>
          <Glow color={withAlpha(S.accent, 0.7)} intensity={glow} radius={90} />
        </div>
        {ring > 0 && (
          <div
            style={{
              position: 'absolute',
              left: -30,
              top: -30,
              width: 60,
              height: 60,
              borderRadius: '50%',
              border: `3px solid ${S.accent}`,
              opacity: (1 - ring) * 0.8,
              transform: `scale(${(1 + ring * 1.6).toFixed(3)})`,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: S.card,
            border: `3px solid ${withAlpha(S.text, 0.22)}`,
            boxSizing: 'border-box',
          }}
        />
        {pop > 0.01 && (
          <div
            style={{
              position: 'absolute',
              left: -dot / 2,
              top: -dot / 2,
              width: dot,
              height: dot,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${shade(S.accent, 0.45)} 0%, ${S.accent} 60%)`,
              boxShadow: `0 0 ${(18 + breath * 14).toFixed(1)}px ${withAlpha(S.accent, 0.8)}, 0 8px 18px rgba(0,0,0,0.35)`,
            }}
          />
        )}
      </div>
      {/* Step number */}
      <div
        style={{
          position: 'absolute',
          left: x - 60,
          width: 120,
          top: LINE_Y - 92,
          textAlign: 'center',
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 3,
          color: lit ? S.accent : S.muted,
          opacity: enter * (0.55 + 0.45 * litP),
          transform: `translateY(${((1 - enter) * 12).toFixed(2)}px)`,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      {/* Stem + card */}
      <div
        style={{
          position: 'absolute',
          left: x - 1,
          top: LINE_Y + 34,
          width: 2,
          height: (CARD_TOP - LINE_Y - 34) * litP,
          background: `linear-gradient(${S.accent}, ${withAlpha(S.accent, 0)})`,
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x - width / 2,
          top: CARD_TOP,
          width,
          opacity: enter * (0.5 + 0.5 * litP),
          transform: `translateY(${cardLift.toFixed(2)}px) ${floatTransform(cardFloat)} scale(${cardScale.toFixed(4)}) ${reactionTransform(reaction)}`,
        }}
      >
        <div
          style={{
            position: 'relative',
            borderRadius: 24,
            padding: '26px 18px',
            background: lit ? S.cardRaised : S.card,
            border: `1.5px solid ${current && lit ? withAlpha(S.accent, 0.6) : S.cardBorder}`,
            boxShadow: `${shadow}${current && lit ? `, 0 0 40px ${S.accentSoft}` : ''}`,
            fontFamily: S.font,
            fontWeight: 700,
            fontSize,
            lineHeight: 1.15,
            color: lit ? S.text : S.muted,
            textAlign: 'center',
            overflowWrap: 'break-word',
          }}
        >
          {label}
        </div>
      </div>
    </>
  );
};

export const TimelineScene: React.FC<{ scene: TimelineSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const float = useFloat('timeline', 3, 5.4);
  const steps = scene.steps;
  const n = steps.length;
  const xs = xsFor(n);
  const ats = steps.map((s) => s.at);
  const first = (xs[0] ?? 0) - LEAD;
  const last = (xs[n - 1] ?? 0) + LEAD;
  const track = ramp(t, 0.05, 0.7);
  const tip = fillX(t, xs, ats);
  const drawing = tip > first + 1 && steps.some((s) => t < s.at && t > s.at - DRAW_SEC - 0.05);
  const spacing = n > 1 ? (xs[1] ?? 0) - (xs[0] ?? 0) : 400;
  const width = Math.min(n <= 2 ? 340 : 280, spacing - 22);
  const fontSize = n <= 3 ? 44 : n === 4 ? 36 : 31;
  let currentIndex = -1;
  for (let i = 0; i < n; i++) if (t >= (ats[i] ?? 0)) currentIndex = i;
  const tipFade = interpolate(t, [(ats[n - 1] ?? 0) - 0.05, (ats[n - 1] ?? 0) + 0.2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, transform: floatTransform(float) }}>
      {/* Track */}
      <div
        style={{
          position: 'absolute',
          left: first,
          top: LINE_Y - 3,
          width: (last - first) * track,
          height: 6,
          borderRadius: 3,
          background: `linear-gradient(90deg, ${withAlpha(S.text, 0)} 0%, ${withAlpha(S.text, 0.16)} 8%, ${withAlpha(S.text, 0.16)} 92%, ${withAlpha(S.text, 0)} 100%)`,
        }}
      />
      {/* Drawn accent line */}
      <div
        style={{
          position: 'absolute',
          left: first,
          top: LINE_Y - 3,
          width: Math.max(0, tip - first),
          height: 6,
          borderRadius: 3,
          background: `linear-gradient(90deg, ${withAlpha(S.accent, 0)} 0%, ${S.accent} ${Math.min(60, (LEAD / Math.max(1, tip - first)) * 100).toFixed(1)}%)`,
          boxShadow: `0 0 18px ${withAlpha(S.accent, 0.55)}`,
        }}
      />
      {drawing && (
        <div
          style={{
            position: 'absolute',
            left: tip - 9,
            top: LINE_Y - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: S.text,
            opacity: tipFade,
            boxShadow: `0 0 20px 6px ${withAlpha(S.accent, 0.8)}`,
          }}
        />
      )}
      {steps.map((s, i) => (
        <Step
          key={`${i}-${s.label}`}
          label={s.label}
          at={s.at}
          index={i}
          x={xs[i] ?? 0}
          width={width}
          fontSize={fontSize}
          current={i === currentIndex}
        />
      ))}
    </div>
  );
};
