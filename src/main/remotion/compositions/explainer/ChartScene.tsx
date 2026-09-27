/**
 * Chart scene — bars or a line rising (growth, accent) or falling (decline,
 * negative) on `growAt`, point labels underneath, and an optional callout
 * pill that pops on the last point with a soft burst.
 *
 * Motion adapted from Remocn animated-bar-chart / animated-line-chart (MIT).
 */

import { TrendingDown, TrendingUp } from 'lucide-react';
import type React from 'react';
import { interpolate, spring } from 'remotion';
import {
  Burst,
  EASE_IN_OUT_SOFT,
  floatTransform,
  Glow,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useLayout, usePop, useSceneTime, useStage } from './stage';
import type { ChartScene as ChartSceneData } from './types';

const PANEL_LEFT = 90;
const PANEL_TOP = 90;
const PANEL_W = 900;
const PANEL_H = 780;
// Plot area inside the panel.
const PLOT_X = 60;
const PLOT_Y = 190;
const PLOT_W = PANEL_W - 120;
const PLOT_H = 440;
const BASE_Y = PLOT_Y + PLOT_H;
const STAGGER = 0.12;

/** Same timing as `chartCalloutAt` in src/main/ai/explainer/kinds-data.ts. */
function calloutAt(growAt: number, n: number): number {
  return growAt + 0.35 + n * STAGGER + 0.3;
}

interface Pt {
  x: number;
  y: number;
}

/** Bar height (0→1 of max) with spring overshoot; decline bars fall from the first value. */
function barHeights(scene: ChartSceneData, frame: number, fps: number): number[] {
  const max = Math.max(...scene.points.map((p) => p.value), 1e-9);
  const growFrame = Math.round(scene.growAt * fps);
  const first = scene.points[0]?.value ?? 0;
  return scene.points.map((p, i) => {
    const s = spring({
      frame: frame - growFrame - Math.round(i * STAGGER * fps),
      fps,
      config: { damping: 11, stiffness: 110, mass: 0.8 },
    });
    if (scene.trend === 'up' || i === 0) return (p.value / max) * s;
    // Decline: everything rises to the first level, then drops to its value.
    const lift = spring({
      frame: frame - growFrame,
      fps,
      config: { damping: 16, stiffness: 160, mass: 0.7 },
    });
    const fall = spring({
      frame: frame - growFrame - Math.round((0.3 + i * STAGGER) * fps),
      fps,
      config: { damping: 11, stiffness: 110, mass: 0.8 },
    });
    return (first / max) * lift * (1 - fall) + (p.value / max) * fall;
  });
}

/** Leave headroom for the callout pill above the last point. */
function barScale(scene: ChartSceneData): number {
  return scene.callout ? 0.76 : 0.92;
}

interface BarGeom {
  x: number;
  w: number;
  h: number;
}

function barGeometry(scene: ChartSceneData, frame: number, fps: number): BarGeom[] {
  const n = scene.points.length;
  const heights = barHeights(scene, frame, fps);
  const gap = n > 4 ? 26 : 40;
  const w = (PLOT_W - gap * (n - 1)) / n;
  return heights.map((h, i) => ({
    x: PLOT_X + i * (w + gap),
    w,
    h: Math.max(0, h) * PLOT_H * barScale(scene),
  }));
}

const Bars: React.FC<{ scene: ChartSceneData; color: string; bars: BarGeom[] }> = ({
  scene,
  color,
  bars,
}) => {
  const S = useStage();
  const { t } = useSceneTime();
  const n = scene.points.length;
  const top = mixHex(color, '#ffffff', 0.25);

  return (
    <>
      {scene.points.map((p, i) => {
        const g = bars[i] ?? { x: PLOT_X, w: 0, h: 0 };
        const labelIn = ramp(t, 0.2 + i * 0.06, 0.45);
        const last = i === n - 1;
        return (
          <Bar
            key={`${i}-${p.label}`}
            index={i}
            x={g.x}
            w={g.w}
            h={g.h}
            color={color}
            top={top}
            label={p.label}
            labelIn={labelIn}
            ghost={S.cardRaised}
            highlight={last && t >= calloutAt(scene.growAt, n) - 0.2}
          />
        );
      })}
    </>
  );
};

const Bar: React.FC<{
  index: number;
  x: number;
  w: number;
  h: number;
  color: string;
  top: string;
  label: string;
  labelIn: number;
  ghost: string;
  highlight: boolean;
}> = ({ index, x, w, h, color, top, label, labelIn, ghost, highlight }) => {
  const S = useStage();
  const reaction = useReaction(index);
  const breath = useBreath(`bar${index}`);
  const scale = reaction.scale;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: BASE_Y - PLOT_H * 0.92,
          width: w,
          height: PLOT_H * 0.92,
          borderRadius: 18,
          background: withAlpha(ghost, 0.55),
          opacity: labelIn * 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x,
          top: BASE_Y - h,
          width: w,
          height: h,
          borderRadius: `18px 18px 8px 8px`,
          background: `linear-gradient(180deg, ${top} 0%, ${color} 55%, ${mixHex(color, S.bgOuter, 0.35)} 100%)`,
          boxShadow: `0 0 ${(28 + (highlight ? breath * 30 : 0)).toFixed(0)}px ${withAlpha(color, highlight ? 0.6 : 0.3)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
          transform: `scaleX(${scale})`,
          transformOrigin: '50% 100%',
        }}
      >
        <Glow color={withAlpha(color, 0.5)} intensity={reaction.glow} radius={80} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: x - 20,
          width: w + 40,
          top: BASE_Y + 22,
          textAlign: 'center',
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: 32,
          color: highlight ? S.text : S.muted,
          opacity: labelIn,
        }}
      >
        {label}
      </div>
    </>
  );
};

interface LineGeom {
  pts: Pt[];
  cum: number[];
  total: number;
  progress: number;
  dot: Pt;
}

function lineGeometry(scene: ChartSceneData, t: number): LineGeom {
  const n = scene.points.length;
  const values = scene.points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const lo = Math.max(0, min - (max - min) * 0.7);
  const range = max - lo || 1;
  const inset = 40;
  const pts: Pt[] = values.map((v, i) => ({
    x: PLOT_X + inset + (i / (n - 1)) * (PLOT_W - inset * 2),
    y: BASE_Y - 12 - ((v - lo) / range) * (PLOT_H * (scene.callout ? 0.72 : 0.86)),
  }));
  // Analytical path length + the head position along it.
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[cum.length - 1] || 1;
  const progress = interpolate(t, [scene.growAt, scene.growAt + 0.35 + n * STAGGER], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_IN_OUT_SOFT,
  });
  const len = total * progress;
  let seg = 1;
  while (seg < pts.length - 1 && (cum[seg] ?? 0) < len) seg++;
  const a = pts[seg - 1] as Pt;
  const b = pts[seg] as Pt;
  const segLen = (cum[seg] ?? 0) - (cum[seg - 1] ?? 0) || 1;
  const k = Math.min(1, Math.max(0, (len - (cum[seg - 1] ?? 0)) / segLen));
  return { pts, cum, total, progress, dot: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } };
}

const Line: React.FC<{ scene: ChartSceneData; color: string; geom: LineGeom }> = ({
  scene,
  color,
  geom,
}) => {
  const S = useStage();
  const { t } = useSceneTime();
  const { pts, cum, total, progress, dot } = geom;
  const len = total * progress;

  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const first = pts[0] as Pt;
  const lastPt = pts[pts.length - 1] as Pt;
  const area = `${d} L${lastPt.x.toFixed(1)},${BASE_Y} L${first.x.toFixed(1)},${BASE_Y} Z`;
  const gradId = `chart-area-${scene.trend}`;
  const clipId = `chart-clip-${scene.trend}`;
  const breath = useBreath('chart-line');

  return (
    <>
      <svg
        width={PANEL_W}
        height={PANEL_H}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.42} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={dot.x} height={PANEL_H} />
          </clipPath>
        </defs>
        {progress > 0 && <path d={area} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />}
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${total} ${total + 40}`}
          strokeDashoffset={total * (1 - progress)}
          style={{ filter: `drop-shadow(0 0 14px ${withAlpha(color, 0.6)})` }}
        />
        {pts.map((p, i) => {
          const reached = progress > 0 && len >= (cum[i] ?? 0) - 0.5;
          if (!reached) return null;
          return (
            <LineDot
              key={`d${i}`}
              index={i}
              p={p}
              color={color}
              fill={S.card}
              scene={scene}
              cumAt={cum[i] ?? 0}
              total={total}
            />
          );
        })}
        {progress > 0 && (
          <circle
            cx={dot.x}
            cy={dot.y}
            r={15 + breath * 3}
            fill={color}
            style={{ filter: `drop-shadow(0 0 14px ${color})` }}
          />
        )}
      </svg>
      {scene.points.map((p, i) => {
        const labelIn = ramp(t, 0.2 + i * 0.06, 0.45);
        const pt = pts[i] as Pt;
        return (
          <div
            key={`${i}-${p.label}`}
            style={{
              position: 'absolute',
              left: pt.x - 80,
              width: 160,
              top: BASE_Y + 22,
              textAlign: 'center',
              fontFamily: S.font,
              fontWeight: 700,
              fontSize: 32,
              color: S.muted,
              opacity: labelIn,
            }}
          >
            {p.label}
          </div>
        );
      })}
    </>
  );
};

const LineDot: React.FC<{
  index: number;
  p: Pt;
  color: string;
  fill: string;
  scene: ChartSceneData;
  cumAt: number;
  total: number;
}> = ({ index, p, color, fill, scene, cumAt, total }) => {
  const n = scene.points.length;
  const drawDur = 0.35 + n * STAGGER;
  // Approximate the moment the (eased) line reaches this point.
  const reachAt = scene.growAt + drawDur * (cumAt / total) * 0.9;
  const pop = usePop(reachAt, 260, 12);
  const reaction = useReaction(index);
  return (
    <circle
      cx={p.x}
      cy={p.y}
      r={Math.max(0, 9 * pop * reaction.scale + reaction.glow * 4)}
      fill={fill}
      stroke={color}
      strokeWidth={5}
    />
  );
};

export const ChartScene: React.FC<{ scene: ChartSceneData }> = ({ scene }) => {
  const S = useStage();
  const { floating } = useLayout();
  const { t } = useSceneTime();
  const float = useFloat('chart', 4);
  const shadow = useLivingShadow('chart');
  const up = scene.trend === 'up';
  const color = up ? S.accent : S.negative;
  const trendColor = up ? S.positive : S.negative;
  const TrendIcon = up ? TrendingUp : TrendingDown;
  const n = scene.points.length;
  const cAt = calloutAt(scene.growAt, n);
  const enter = ramp(t, 0, 0.55);
  const titleIn = ramp(t, 0.1, 0.5);
  const chip = usePop(scene.growAt, 200, 13);
  const callout = usePop(cAt, 240, 11);

  const { frame, fps } = useSceneTime();
  const line = scene.style === 'line' ? lineGeometry(scene, t) : null;
  const bars = line ? [] : barGeometry(scene, frame, fps);
  const lastBar = bars[bars.length - 1];
  const tip: Pt = line
    ? line.dot
    : lastBar
      ? { x: lastBar.x + lastBar.w / 2, y: BASE_Y - lastBar.h }
      : { x: PLOT_X + PLOT_W, y: BASE_Y };

  return (
    <div
      style={{
        position: 'absolute',
        left: PANEL_LEFT,
        top: PANEL_TOP,
        width: PANEL_W,
        height: PANEL_H,
        borderRadius: 40,
        background: floating ? 'transparent' : S.card,
        border: floating ? 'none' : `1px solid ${S.cardBorder}`,
        boxShadow: floating ? 'none' : shadow,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px) ${floatTransform(float)}`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: PLOT_X,
          top: 56,
          right: PLOT_X,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 16}px)`,
        }}
      >
        <div style={{ fontFamily: S.font, fontWeight: 800, fontSize: 54, color: S.text }}>
          {scene.title}
        </div>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
            background: withAlpha(trendColor, 0.16),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${0.6 + 0.4 * chip})`,
            opacity: Math.min(1, chip * 1.5),
          }}
        >
          <TrendIcon size={44} strokeWidth={2.6} color={trendColor} />
        </div>
      </div>
      {[0.25, 0.5, 0.75].map((f) => (
        <div
          key={f}
          style={{
            position: 'absolute',
            left: PLOT_X,
            width: PLOT_W,
            top: BASE_Y - PLOT_H * f,
            height: 2,
            background: S.cardBorder,
            opacity: titleIn * 0.8,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: PLOT_X,
          width: PLOT_W * titleIn,
          top: BASE_Y,
          height: 3,
          borderRadius: 2,
          background: withAlpha(S.muted, 0.45),
        }}
      />
      {line ? (
        <Line scene={scene} color={color} geom={line} />
      ) : (
        <Bars scene={scene} color={color} bars={bars} />
      )}
      {scene.callout && (
        <CalloutPill text={scene.callout} pop={callout} color={trendColor} tip={tip} at={cAt} />
      )}
    </div>
  );
};

const CalloutPill: React.FC<{
  text: string;
  pop: number;
  color: string;
  tip: Pt;
  at: number;
}> = ({ text, pop, color, tip, at }) => {
  const S = useStage();
  if (pop <= 0.001) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: tip.x,
          top: tip.y - 44,
          transform: `translate(-50%, -100%) translateY(${(1 - pop) * 30}px) scale(${pop})`,
          transformOrigin: '50% 100%',
          background: color,
          color: S.bgOuter,
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 44,
          padding: '10px 28px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
          boxShadow: `0 0 40px ${withAlpha(color, 0.55)}, 0 14px 30px rgba(0,0,0,0.4)`,
        }}
      >
        {text}
      </div>
      <Burst atSec={at} x={tip.x} y={tip.y - 80} color={color} radius={170} seed="chart-callout" />
    </>
  );
};
