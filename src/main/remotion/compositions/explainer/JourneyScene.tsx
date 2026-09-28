/**
 * Journey scene — an up-and-down life curve. A smooth Catmull-Rom curve runs
 * through 3–5 moments (x evenly spaced, y from level −2 rock bottom … 2
 * peak) and draws progressively, reaching each point exactly on its `at`.
 * Each point pops a dot + label (above for highs, below for lows); lows are
 * tinted negative, highs accent, and a glowing marker rides the line tip.
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
  useReaction,
} from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import { EXPLAINER_STAGE_WIDTH, type JourneyScene as JourneySceneData } from './types';

const X0 = 150;
const X1 = EXPLAINER_STAGE_WIDTH - 150;
const MID_Y = 480;
const LEVEL_PX = 128;
const SAMPLES = 36;
/** Longest time one segment takes to draw (shorter if the beats are closer). */
const SEG_MAX_SEC = 0.85;
const LABEL_W = 250;
const LABEL_GAP = 40;
const SIDE_GAP = 28;

/**
 * Where a point's label goes so the curve never runs through it: peaks
 * above, valleys below; on a rising pass lower-right, on a falling pass
 * upper-right (the free quadrants beside a diagonal).
 */
type Place = 'above' | 'below' | 'belowRight' | 'aboveRight';

function placeOf(levels: number[], i: number): Place {
  const cur = levels[i] ?? 0;
  const prev = levels[i - 1];
  const next = levels[i + 1];
  const upFromPrev = prev === undefined ? null : Math.sign(cur - prev);
  const upToNext = next === undefined ? null : Math.sign(next - cur);
  const inSign = upFromPrev ?? (upToNext === null ? 0 : -upToNext);
  const outSign = upToNext ?? (upFromPrev === null ? 0 : -upFromPrev);
  if (inSign > 0 && outSign < 0) return 'above';
  if (inSign < 0 && outSign > 0) return 'below';
  if (inSign > 0 && outSign > 0) return 'belowRight';
  if (inSign < 0 && outSign < 0) return 'aboveRight';
  // Flat on one side: fall back to the level.
  if (inSign === 0 && outSign === 0) return cur >= 0 ? 'above' : 'below';
  const s = inSign === 0 ? -outSign : inSign;
  return s > 0 ? 'above' : 'below';
}

interface Pt {
  x: number;
  y: number;
}

function pointsOf(scene: JourneySceneData): Pt[] {
  const n = scene.points.length;
  return scene.points.map((p, i) => ({
    x: n <= 1 ? (X0 + X1) / 2 : X0 + (i / (n - 1)) * (X1 - X0),
    y: MID_Y - Math.max(-2, Math.min(2, p.level)) * LEVEL_PX,
  }));
}

/** Sample a Catmull-Rom spline (as cubic Béziers) into a dense polyline. */
function sampleCurve(pts: Pt[]): { poly: Pt[]; knotIndex: number[] } {
  const poly: Pt[] = [];
  const knotIndex: number[] = [];
  if (pts.length === 0) return { poly, knotIndex };
  poly.push(pts[0] as Pt);
  knotIndex.push(0);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? (pts[i] as Pt);
    const p1 = pts[i] as Pt;
    const p2 = pts[i + 1] as Pt;
    const p3 = pts[i + 2] ?? p2;
    const tension = 0.5;
    const c1 = {
      x: p1.x + ((p2.x - p0.x) / 6) * tension * 2,
      y: p1.y + ((p2.y - p0.y) / 6) * tension * 2,
    };
    const c2 = {
      x: p2.x - ((p3.x - p1.x) / 6) * tension * 2,
      y: p2.y - ((p3.y - p1.y) / 6) * tension * 2,
    };
    for (let s = 1; s <= SAMPLES; s++) {
      const u = s / SAMPLES;
      const v = 1 - u;
      poly.push({
        x: v * v * v * p1.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p2.x,
        y: v * v * v * p1.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p2.y,
      });
    }
    knotIndex.push(poly.length - 1);
  }
  return { poly, knotIndex };
}

function cumulative(poly: Pt[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1] as Pt;
    const b = poly[i] as Pt;
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return cum;
}

/** Arc length drawn at time `t`: segment i→i+1 finishes exactly on point i+1's beat. */
function drawnLength(scene: JourneySceneData, knotLen: number[], t: number): number {
  const pts = scene.points;
  const first = pts[0];
  if (!first || t < first.at) return -1;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1] as JourneySceneData['points'][number];
    const cur = pts[i] as JourneySceneData['points'][number];
    const start = Math.max(prev.at + 0.05, cur.at - SEG_MAX_SEC);
    const end = Math.max(start + 0.01, cur.at);
    const a = knotLen[i - 1] ?? 0;
    const b = knotLen[i] ?? a;
    if (t >= end) {
      len = b;
      continue;
    }
    const k = interpolate(t, [start, end], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASE_IN_OUT_SOFT,
    });
    return a + (b - a) * k;
  }
  return len;
}

function pointAt(poly: Pt[], cum: number[], len: number): Pt {
  let i = 1;
  while (i < poly.length - 1 && (cum[i] ?? 0) < len) i++;
  const a = poly[i - 1] ?? poly[0] ?? { x: X0, y: MID_Y };
  const b = poly[i] ?? a;
  const segLen = (cum[i] ?? 0) - (cum[i - 1] ?? 0) || 1;
  const k = Math.min(1, Math.max(0, (len - (cum[i - 1] ?? 0)) / segLen));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

const JourneyPoint: React.FC<{
  index: number;
  label: string;
  level: number;
  at: number;
  p: Pt;
  color: string;
  place: Place;
}> = ({ index, label, level, at, p, color, place }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pop = usePop(at, 240, 12);
  const labelIn = ramp(t, at + 0.05, 0.45);
  const reaction = useReaction(index);
  const ring = ramp(t, at, 0.7);
  const above = place === 'above' || place === 'aboveRight';
  const side = place === 'belowRight' || place === 'aboveRight';
  if (t < at) return null;
  const left = side
    ? p.x + SIDE_GAP
    : Math.max(40, Math.min(EXPLAINER_STAGE_WIDTH - 40 - LABEL_W, p.x - LABEL_W / 2));
  const gap = side ? 10 : LABEL_GAP;
  const extreme = Math.abs(level) === 2;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: p.x - 60,
          top: p.y - 60,
          width: 120,
          height: 120,
          transform: reactionTransform(reaction),
        }}
      >
        <Glow color={withAlpha(color, 0.45)} intensity={0.4 + reaction.glow} radius={70} />
        {ring < 1 && (
          <div
            style={{
              position: 'absolute',
              left: 60 - 18 - ring * 34,
              top: 60 - 18 - ring * 34,
              width: 36 + ring * 68,
              height: 36 + ring * 68,
              borderRadius: '50%',
              border: `3px solid ${withAlpha(color, 0.7 * (1 - ring))}`,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 60 - 17,
            top: 60 - 17,
            width: 34,
            height: 34,
            borderRadius: 17,
            background: S.card,
            border: `7px solid ${color}`,
            boxSizing: 'border-box',
            transform: `scale(${Math.max(0, pop).toFixed(4)})`,
            boxShadow: `0 0 18px ${withAlpha(color, 0.6)}`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left,
          width: LABEL_W,
          ...(above ? { bottom: 960 - (p.y - gap) } : { top: p.y + gap }),
          textAlign: side ? 'left' : 'center',
          fontFamily: S.font,
          fontWeight: extreme ? 800 : 700,
          fontSize: 38,
          lineHeight: 1.12,
          color: level < 0 ? mixHex(S.negative, S.text, 0.25) : S.text,
          opacity: labelIn,
          transform: `translateY(${((1 - labelIn) * (above ? 14 : -14)).toFixed(2)}px) ${reactionTransform(reaction)}`,
          textShadow: '0 2px 14px rgba(0,0,0,0.5)',
        }}
      >
        {label}
      </div>
    </>
  );
};

export const JourneyScene: React.FC<{ scene: JourneySceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const float = useFloat('journey', 3, 5.6);
  const breath = useBreath('journey-tip');
  const pts = pointsOf(scene);
  const levels = scene.points.map((p) => p.level);
  const { poly, knotIndex } = sampleCurve(pts);
  const cum = cumulative(poly);
  const total = cum[cum.length - 1] ?? 0;
  const knotLen = knotIndex.map((k) => cum[k] ?? 0);
  const len = drawnLength(scene, knotLen, t);
  const tip = len >= 0 ? pointAt(poly, cum, len) : null;
  const gridIn = ramp(t, 0, 0.6);

  const colorAt = (y: number): string => {
    const level = (MID_Y - y) / LEVEL_PX;
    return level >= 0
      ? mixHex(mixHex(S.text, S.accent, 0.35), S.accent, Math.min(1, level / 2))
      : mixHex(mixHex(S.text, S.negative, 0.35), S.negative, Math.min(1, -level / 2));
  };
  const top = MID_Y - 2 * LEVEL_PX;
  const bottom = MID_Y + 2 * LEVEL_PX;
  const d = poly
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const shown = Math.max(0, len);
  const tipColor = tip ? colorAt(tip.y) : S.accent;

  return (
    <div style={{ position: 'absolute', inset: 0, transform: floatTransform(float) }}>
      {/* Baseline at level 0 + faint peak/bottom guides. */}
      {[-2, 0, 2].map((lv) => (
        <div
          key={lv}
          style={{
            position: 'absolute',
            left: 70,
            right: 70,
            top: MID_Y - lv * LEVEL_PX - 1,
            height: 0,
            borderTop: `2px ${lv === 0 ? 'solid' : 'dashed'} ${withAlpha(S.muted, lv === 0 ? 0.35 : 0.16)}`,
            opacity: gridIn,
          }}
        />
      ))}
      <svg
        width={EXPLAINER_STAGE_WIDTH}
        height={960}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="journey-stroke"
            gradientUnits="userSpaceOnUse"
            x1={0}
            x2={0}
            y1={top}
            y2={bottom}
          >
            <stop offset="0%" stopColor={S.accent} />
            <stop offset="50%" stopColor={mixHex(S.text, S.accent, 0.35)} />
            <stop offset="100%" stopColor={S.negative} />
          </linearGradient>
        </defs>
        {len > 0 && (
          <>
            <path
              d={d}
              fill="none"
              stroke="url(#journey-stroke)"
              strokeOpacity={0.35}
              strokeWidth={22}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${shown} ${total + 40}`}
              style={{ filter: 'blur(10px)' }}
            />
            <path
              d={d}
              fill="none"
              stroke="url(#journey-stroke)"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${shown} ${total + 40}`}
            />
          </>
        )}
      </svg>
      {/* Tip marker rides under the point dots so it tucks behind a landed dot. */}
      {tip && (
        <div
          style={{
            position: 'absolute',
            left: tip.x - 16,
            top: tip.y - 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            background: mixHex(tipColor, '#ffffff', 0.45),
            boxShadow: `0 0 ${(18 + breath * 14).toFixed(1)}px ${withAlpha(tipColor, 0.9)}, 0 0 0 6px ${withAlpha(tipColor, 0.25)}`,
          }}
        />
      )}
      {scene.points.map((p, i) => {
        const pt = pts[i] as Pt;
        return (
          <JourneyPoint
            key={`${p.at}-${p.label}`}
            index={i}
            label={p.label}
            level={p.level}
            at={p.at}
            p={pt}
            color={colorAt(pt.y)}
            place={placeOf(levels, i)}
          />
        );
      })}
    </div>
  );
};
