/**
 * Streak scene — a 7-column calendar of `days` squares. Between `fillAt` and
 * `doneAt` the days tick over one by one in the accent (rounded fill + drawn
 * check) while a "N days" counter rolls up underneath, landing on `doneAt`.
 * An optional `missDay` turns negative with an X and shakes; the chain keeps
 * filling after it but the red square stays.
 */

import type React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Burst, floatTransform, Glow, useBreath, useFloat } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { StreakScene as StreakSceneData } from './types';

const COLS = 7;
const GAP = 16;
const GRID_MAX_W = 900;
const GRID_MAX_H = 560;

/** Damped shake offset (px) starting at `atSec`. */
function shakeAt(t: number, atSec: number, amp: number): number {
  const local = t - atSec;
  if (local < 0 || local > 0.6) return 0;
  return Math.sin(local * 58) * amp * Math.exp(-local / 0.14);
}

const Day: React.FC<{
  day: number;
  size: number;
  fillAt: number;
  miss: boolean;
  doneAt: number;
  head: boolean;
}> = ({ day, size, fillAt, miss, doneAt, head }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pop = usePop(fillAt, 280, 15);
  const filled = t >= fillAt;
  const k = filled ? Math.min(1, pop) : 0;
  const draw = ramp(t, fillAt + 0.03, 0.3);
  const tone = miss ? S.negative : S.accent;
  const shake = miss ? shakeAt(t, fillAt, 10) + shakeAt(t, doneAt, 8) : 0;
  const radius = Math.round(size * 0.26);
  const ink = S.bgOuter;
  const numSize = Math.round(size * 0.3);

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        transform: `translateX(${shake.toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background: S.card,
          border: `2px solid ${S.cardBorder}`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: numSize,
          color: withAlpha(S.muted, 0.8),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {day}
      </div>
      {filled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            background: `linear-gradient(150deg, ${mixHex(tone, '#ffffff', 0.18)} 0%, ${tone} 70%)`,
            transform: `scale(${(0.55 + 0.45 * pop).toFixed(4)})`,
            opacity: k,
            boxShadow: head
              ? `0 0 ${Math.round(size * 0.4)}px ${withAlpha(tone, 0.65)}`
              : `0 6px 18px ${withAlpha(tone, 0.25)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            aria-hidden="true"
            width={size * 0.56}
            height={size * 0.56}
            viewBox="0 0 24 24"
            fill="none"
          >
            {miss ? (
              <path
                d="M6 6 L18 18 M18 6 L6 18"
                stroke={ink}
                strokeWidth={3.4}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - draw}
              />
            ) : (
              <path
                d="M4.5 12.5 L9.8 17.5 L19.5 6.8"
                stroke={ink}
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - draw}
              />
            )}
          </svg>
        </div>
      )}
    </div>
  );
};

/** Rolling integer: the previous value slides up and out as the new one lands. */
const RollingCount: React.FC<{
  value: number;
  changedAt: number;
  rollSec: number;
  size: number;
  color: string;
}> = ({ value, changedAt, rollSec, size, color }) => {
  const { t } = useSceneTime();
  const p = value === 0 ? 1 : ramp(t, changedAt, rollSec);
  const prev = Math.max(0, value - 1);
  const h = size * 1.1;
  const cell = (v: number, y: number, o: number): React.ReactNode => (
    <span
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: h,
        lineHeight: `${h}px`,
        transform: `translateY(${y.toFixed(2)}px)`,
        opacity: o,
      }}
    >
      {v}
    </span>
  );
  const width = `${String(value).length * 0.62}em`;
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        height: h,
        width,
        overflow: 'hidden',
        maskImage:
          'linear-gradient(to bottom, transparent 0%, black 22%, black 80%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 22%, black 80%, transparent 100%)',
        fontSize: size,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {p < 1 && cell(prev, -p * h * 0.8, 1 - p)}
      {cell(value, (1 - p) * h * 0.8, p)}
    </span>
  );
};

export const StreakScene: React.FC<{ scene: StreakSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = useFloat('streak', 4);
  const breath = useBreath('streak');

  const days = Math.max(1, Math.min(35, Math.round(scene.days)));
  const missIdx =
    scene.missDay !== undefined && scene.missDay >= 1 && scene.missDay <= days
      ? Math.round(scene.missDay) - 1
      : -1;
  const hasMiss = missIdx >= 0;
  const fillAt = scene.fillAt;
  const doneAt = Math.max(scene.doneAt, fillAt + 0.3);
  const fillTime = (i: number): number =>
    days <= 1 ? doneAt : fillAt + (i / (days - 1)) * (doneAt - fillAt);

  // A roll must finish before the next day ticks, or the digits smear.
  const rollSec = Math.max(0.04, Math.min(0.22, ((doneAt - fillAt) / Math.max(1, days - 1)) * 0.9));

  const cols = Math.min(COLS, days);
  const rows = Math.ceil(days / COLS);
  const size = Math.floor(
    Math.min(
      (GRID_MAX_W - (cols - 1) * GAP) / cols,
      (GRID_MAX_H - (rows - 1) * GAP) / rows,
      rows === 1 ? 132 : rows === 2 ? 118 : 108,
    ),
  );

  // Counter = chain days done (the missed day does not count).
  let count = 0;
  let changedAt = fillAt;
  let head = -1;
  for (let i = 0; i < days; i++) {
    const at = fillTime(i);
    if (t < at) break;
    head = i;
    if (i !== missIdx) {
      count++;
      changedAt = at;
    }
  }

  const enter = ramp(t, 0.05, 0.5);
  const k = frame - Math.round(doneAt * fps);
  const bounce = k >= 0 ? Math.exp(-k / 6) * Math.sin(k * 0.55) * (hasMiss ? 0.05 : 0.1) : 0;
  const landed = ramp(t, doneAt, 0.5);
  const counterColor = hasMiss ? S.text : mixHex(S.text, S.accent, landed);
  const labelSize = scene.label.length > 16 ? 56 : 62;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 34,
        padding: 60,
        opacity: enter,
        transform: `translateY(${((1 - enter) * 24).toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          fontFamily: S.font,
          fontWeight: 750,
          fontSize: labelSize,
          letterSpacing: '-0.02em',
          color: S.text,
          whiteSpace: 'nowrap',
          lineHeight: 1.1,
        }}
      >
        {scene.label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${size}px)`,
          gap: GAP,
          transform: floatTransform(float),
        }}
      >
        {Array.from({ length: days }, (_, i) => (
          <Day
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed calendar grid
            key={i}
            day={i + 1}
            size={size}
            fillAt={fillTime(i)}
            miss={i === missIdx}
            doneAt={doneAt}
            head={i === head && t < doneAt + 0.4}
          />
        ))}
      </div>
      <div style={{ position: 'relative', width: 440, display: 'flex', justifyContent: 'center' }}>
        <Glow
          color={withAlpha(S.accent, 0.55)}
          intensity={hasMiss ? 0 : landed * (0.35 + breath * 0.3)}
          radius={110}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'baseline',
            gap: 18,
            fontFamily: S.font,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            transform: `scale(${(1 + bounce).toFixed(4)})`,
            opacity: 0.45 + 0.55 * ramp(t, fillAt, 0.3),
          }}
        >
          <RollingCount
            value={count}
            changedAt={changedAt}
            rollSec={rollSec}
            size={96}
            color={counterColor}
          />
          <span style={{ fontSize: 50, fontWeight: 700, color: S.muted, letterSpacing: 0 }}>
            {count === 1 ? 'day' : 'days'}
          </span>
        </div>
        {!hasMiss && (
          <Burst atSec={doneAt} x={220} y={53} color={S.accent} seed="streak" radius={190} />
        )}
      </div>
    </div>
  );
};
