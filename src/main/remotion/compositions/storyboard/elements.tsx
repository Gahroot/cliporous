/**
 * Board elements in world space. Every element draws itself on from its `at`
 * and then holds its final pose forever, so the camera can return to it.
 * One component per kind; the skin only changes stroke style and surfaces.
 */

import type React from 'react';
import { interpolate, spring } from 'remotion';
import { bendControl, easeCurvePoints, quad, sampleQuad, seeded, wobblePath } from './camera';
import { type BoardLook, toneColor } from './look';
import { counterText, textAdvance, wrapBoardText } from './text-layout';
import type { BoardElement, Pt, TextSegment } from './types';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Ease-out draw progress over [at, at+dur]. */
export function drawP(t: number, at: number, dur: number): number {
  const p = clamp01((t - at) / Math.max(0.001, dur));
  return 1 - (1 - p) ** 2.4;
}

/** Hand-written text duration: fast for short words, capped for long labels. */
export function writeDur(text: string): number {
  return Math.min(0.85, 0.12 + text.length * 0.045);
}

interface DrawProps {
  t: number;
  fps: number;
  look: BoardLook;
}

/** One stroked path that draws on via dash offset (`pathLength` normalised to 1). */
const Stroke: React.FC<{
  d: string;
  p: number;
  color: string;
  width: number;
  opacity?: number;
}> = ({ d, p, color, width, opacity = 1 }) => {
  if (p <= 0) return null;
  return (
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="1 1"
      strokeDashoffset={1 - p}
      opacity={opacity}
    />
  );
};

/** Text that writes on left→right (ink) or rises out of a mask (polish). */
export const WriteOn: React.FC<{
  t: number;
  at: number;
  text: string;
  look: BoardLook;
  size: number;
  color: string;
  weight?: number;
  font?: string;
}> = ({ t, at, text, look, size, color, weight, font }) => {
  const ink = look.skin === 'ink';
  const dur = ink ? writeDur(text) : 0.42;
  const p = drawP(t, at, dur);
  if (p <= 0) return null;
  const base: React.CSSProperties = {
    display: 'inline-block',
    whiteSpace: 'nowrap',
    fontFamily: font ?? look.hand,
    fontSize: size,
    fontWeight: weight ?? (ink ? 600 : 700),
    lineHeight: 1.1,
    color,
    letterSpacing: ink ? 0.5 : -0.4,
  };
  if (ink) {
    return (
      <span style={{ ...base, clipPath: `inset(-20% ${((1 - p) * 102).toFixed(2)}% -30% -4%)` }}>
        {text}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: 4 }}>
      <span
        style={{
          ...base,
          transform: `translateY(${((1 - p) * 105).toFixed(2)}%)`,
          opacity: 0.2 + p * 0.8,
        }}
      >
        {text}
      </span>
    </span>
  );
};

// ── frame ──────────────────────────────────────────────────────────────────

const TitleSegments: React.FC<{
  t: number;
  segments: TextSegment[];
  look: BoardLook;
  size: number;
}> = ({ t, segments, look, size }) => (
  <>
    {segments.map((s) => (
      <WriteOn
        key={`${s.at}-${s.text}`}
        t={t}
        at={s.at}
        text={s.text.replace(/ /g, '\u00a0')}
        look={look}
        size={size}
        color={look.ink}
        font={look.skin === 'ink' ? look.hand : look.ui}
        weight={look.skin === 'ink' ? 600 : 650}
      />
    ))}
  </>
);

const FrameEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'frame' }> }> = ({
  el,
  t,
  look,
}) => {
  const ink = look.skin === 'ink';
  const bar = Math.min(64, el.h * 0.16);
  const rows = el.rows ?? 0;
  const hasHeader = el.title !== undefined || el.rows !== undefined || el.rowsAt !== undefined;
  if (t < el.at) return null;
  if (ink) {
    const { x, y, w, h } = el;
    const outline: Pt[] = [
      { x, y },
      { x: x + w, y: y + 2 },
      { x: x + w - 1, y: y + h },
      { x: x + 1, y: y + h - 1 },
      { x, y: y - 4 },
    ];
    const dense: Pt[] = [];
    for (let i = 0; i < outline.length - 1; i++) {
      const a = outline[i] as Pt;
      const b = outline[i + 1] as Pt;
      for (let k = 0; k < 12; k++)
        dense.push({ x: a.x + ((b.x - a.x) * k) / 12, y: a.y + ((b.y - a.y) * k) / 12 });
    }
    dense.push(outline[outline.length - 1] as Pt);
    const pOut = drawP(t, el.at, 0.6);
    const pBar = drawP(t, el.at + 0.4, 0.25);
    return (
      <>
        <svg style={svgAbs} overflow="visible">
          <Stroke
            d={wobblePath(dense, el.id, look.wobble)}
            p={pOut}
            color={look.ink}
            width={look.stroke}
          />
          {hasHeader && (
            <g data-frame-chrome="true">
              <Stroke
                d={wobblePath(
                  [
                    { x, y: y + bar },
                    { x: x + w, y: y + bar + 1 },
                  ],
                  `${el.id}-bar`,
                  look.wobble * 0.6,
                )}
                p={pBar}
                color={look.ink}
                width={look.stroke * 0.9}
              />
              {[0, 1, 2].map((i) => (
                <circle
                  key={i}
                  cx={x + 22 + i * 18}
                  cy={y + bar / 2}
                  r={5}
                  fill="none"
                  stroke={look.ink}
                  strokeWidth={2}
                  opacity={drawP(t, el.at + 0.55 + i * 0.05, 0.1)}
                />
              ))}
            </g>
          )}
          {el.rowsAt !== undefined && <InkRows el={el} t={t} look={look} bar={bar} rows={rows} />}
        </svg>
        {el.title && (
          <div
            style={{
              position: 'absolute',
              left: x + 84,
              top: y + bar / 2 - 23,
              display: 'flex',
              whiteSpace: 'nowrap',
            }}
          >
            <TitleSegments t={t} segments={el.title} look={look} size={36} />
          </div>
        )}
      </>
    );
  }
  const p = drawP(t, el.at, 0.45);
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        borderRadius: 24,
        background: look.cardRaised,
        border: `1.5px solid ${look.cardBorder}`,
        boxShadow: `0 28px 60px ${look.shadow}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 18}px) scale(${0.97 + p * 0.03})`,
        overflow: 'hidden',
      }}
    >
      {hasHeader && (
        <div
          data-frame-chrome="true"
          style={{
            height: bar,
            borderBottom: `1.5px solid ${look.cardBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 24px',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 13,
                height: 13,
                borderRadius: 99,
                background: i === 0 ? look.accent : look.muted,
                opacity: 0.6,
              }}
            />
          ))}
          <div style={{ marginLeft: 16, display: 'flex', whiteSpace: 'nowrap' }}>
            {el.title && <TitleSegments t={t} segments={el.title} look={look} size={30} />}
          </div>
        </div>
      )}
      {el.rowsAt !== undefined &&
        Array.from({ length: rows }, (_, i) => {
          const rp = drawP(t, el.rowsAt as number, 0.3 + i * 0.12);
          const width = 38 + seeded(el.id, i) * 50;
          return (
            <div
              key={i}
              style={{
                margin: `${i === 0 ? 34 : 20}px 0 0 ${i % 3 === 2 ? 70 : 34}px`,
                height: 16,
                borderRadius: 99,
                width: `${width * rp}%`,
                background: i === 1 ? look.accent : look.muted,
                opacity: i === 1 ? 0.75 : 0.35,
              }}
            />
          );
        })}
    </div>
  );
};

const InkRows: React.FC<{
  el: Extract<BoardElement, { kind: 'frame' }>;
  t: number;
  look: BoardLook;
  bar: number;
  rows: number;
}> = ({ el, t, look, bar, rows }) => (
  <>
    {Array.from({ length: rows }, (_, i) => {
      const y = el.y + bar + 44 + i * ((el.h - bar - 70) / Math.max(1, rows - 1));
      const x0 = el.x + (i % 3 === 2 ? 70 : 34);
      const len = (el.w - 90) * (0.45 + seeded(el.id, i) * 0.45);
      const pts = Array.from({ length: 24 }, (_, k) => ({
        x: x0 + (len * k) / 23,
        y: y + Math.sin(k * 0.9 + i) * 3,
      }));
      return (
        <Stroke
          key={i}
          d={wobblePath(pts, `${el.id}-r${i}`, 0.8)}
          p={drawP(t, (el.rowsAt ?? 0) + i * 0.14, 0.32)}
          color={look.muted}
          width={2.4}
        />
      );
    })}
  </>
);

// ── text / glyphs ──────────────────────────────────────────────────────────

const TextEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'text' }> }> = ({
  el,
  t,
  look,
}) => {
  if (t < el.at) return null;
  const ink = look.skin === 'ink';
  const hp = el.highlightAt === undefined ? 0 : drawP(t, el.highlightAt, 0.35);
  const lines = wrapBoardText(el.text, el.size, el.width);
  const lineHeight = el.size * 1.2;
  const width = el.width ?? Math.max(...lines.map((line) => textAdvance(line, el.size)));
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width,
        transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
        textAlign: el.align === 'center' ? 'center' : 'left',
      }}
    >
      {lines.map((line, i) => {
        const text = (color: string) => (
          <WriteOn
            t={t}
            at={el.at}
            text={line}
            look={look}
            size={el.size}
            color={color}
            font={ink ? look.hand : el.tone === 'accent' ? look.serif : look.ui}
            {...(!ink && el.tone === 'accent' ? { weight: 400 } : {})}
          />
        );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: immutable authored text lines
          <div key={i} style={{ position: 'relative', height: lineHeight }}>
            {text(toneColor(look, el.tone))}
            {hp > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: '-2px -8px',
                  padding: '2px 8px',
                  background: look.highlight,
                  borderRadius: ink ? 3 : 9,
                  clipPath: `inset(0 ${(1 - hp) * 100}% 0 0)`,
                }}
              >
                {text(look.highlightText)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const CounterEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'counter' }> }> = ({
  el,
  t,
  fps,
  look,
}) => (
  <TextEl
    el={{
      kind: 'text',
      id: el.id,
      at: el.at,
      x: el.x,
      y: el.y,
      text: counterText(el.value, el.unit),
      size: el.size,
      width: el.width,
      tone: 'accent',
    }}
    t={t}
    fps={fps}
    look={look}
  />
);

const NeqEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'neq' }> }> = ({
  el,
  t,
  look,
}) => {
  if (t < el.at) return null;
  const s = el.size;
  const { x, y } = el;
  const lines: [Pt, Pt][] = [
    [
      { x: x - s * 0.36, y: y - s * 0.14 },
      { x: x + s * 0.36, y: y - s * 0.16 },
    ],
    [
      { x: x - s * 0.36, y: y + s * 0.16 },
      { x: x + s * 0.36, y: y + s * 0.14 },
    ],
    [
      { x: x + s * 0.2, y: y - s * 0.46 },
      { x: x - s * 0.18, y: y + s * 0.46 },
    ],
  ];
  const ink = look.skin === 'ink';
  return (
    <svg style={svgAbs} overflow="visible">
      {lines.map(([a, b], i) => (
        <Stroke
          key={i}
          d={wobblePath(
            sampleQuad(a, bendControl(a, b, ink ? 0.04 : 0), b, 8),
            `${el.id}${i}`,
            look.wobble,
          )}
          p={drawP(t, el.at + i * 0.12, 0.18)}
          color={i === 2 && !ink ? look.accent : look.ink}
          width={look.stroke * (ink ? 1.5 : 1.8)}
        />
      ))}
    </svg>
  );
};

const GlyphEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'glyph' }> }> = ({
  el,
  t,
  fps,
  look,
}) => {
  if (t < el.at) return null;
  const pop = spring({
    frame: Math.round(Math.min(1.2, t - el.at) * fps),
    fps,
    config: { stiffness: 170, damping: 11 },
  });
  const ink = look.skin === 'ink';
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        transform: `translate(-50%, -50%) scale(${pop.toFixed(4)}) rotate(${ink ? 8 : 0}deg)`,
        fontFamily: ink ? look.hand : look.serif,
        fontStyle: ink ? 'normal' : 'italic',
        fontWeight: ink ? 700 : 400,
        fontSize: el.size,
        lineHeight: 1,
        color: ink ? look.ink : look.accent,
      }}
    >
      {el.text}
    </div>
  );
};

// ── arrows / rings ─────────────────────────────────────────────────────────

const ArrowEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'arrow' }> }> = ({
  el,
  t,
  look,
}) => {
  if (t < el.at) return null;
  const c = bendControl(el.from, el.to, el.bend);
  const dur = el.dur ?? 0.4;
  const p = drawP(t, el.at, dur);
  const color = toneColor(look, el.tone);
  const width = look.stroke * (el.dashed ? 0.75 : 1);
  const ink = look.skin === 'ink';
  const pts = sampleQuad(el.from, c, el.to, 30);
  const visible = Math.max(2, Math.round(pts.length * p));
  const shown = pts.slice(0, visible);
  const tip = quad(el.from, c, el.to, p);
  const back = quad(el.from, c, el.to, Math.max(0, p - 0.06));
  const ang = Math.atan2(tip.y - back.y, tip.x - back.x);
  const hl = ink ? 22 : 20;
  const headP = clamp01((p - 0.82) / 0.18);
  const wing = (sign: number): string => {
    const a = ang + Math.PI - sign * 0.5;
    const end = { x: tip.x + Math.cos(a) * hl * headP, y: tip.y + Math.sin(a) * hl * headP };
    return `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  };
  const d = el.dashed
    ? shown.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ')
    : wobblePath(pts, el.id, look.wobble);
  return (
    <svg style={svgAbs} overflow="visible">
      {el.dashed ? (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray="14 12"
        />
      ) : (
        <Stroke d={d} p={p} color={color} width={width} />
      )}
      {el.head !== false && headP > 0 && (
        <>
          <path d={wing(1)} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none" />
          <path d={wing(-1)} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
};

const RingEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'ring' }> }> = ({
  el,
  t,
  look,
}) => {
  if (t < el.at) return null;
  const ink = look.skin === 'ink';
  const start = -2.2 + seeded(el.id, 3) * 0.4;
  // Ink overshoots past the start like a quick marker loop; polish closes cleanly.
  const sweep = ink ? Math.PI * 2 + 0.55 : Math.PI * 2;
  const pts = Array.from({ length: 64 }, (_, i) => {
    const a = start + (sweep * i) / 63;
    const grow = ink ? 1 + (i / 63) * 0.06 : 1;
    return { x: el.cx + Math.cos(a) * el.rx * grow, y: el.cy + Math.sin(a) * el.ry * grow };
  });
  const p = drawP(t, el.at, ink ? 0.55 : 0.6);
  return (
    <svg style={svgAbs} overflow="visible">
      {!ink && p > 0 && (
        <ellipse
          cx={el.cx}
          cy={el.cy}
          rx={el.rx}
          ry={el.ry}
          fill={look.accent}
          opacity={0.07 * p}
        />
      )}
      <Stroke
        d={wobblePath(pts, el.id, look.wobble * 1.5)}
        p={p}
        color={look.accent}
        width={look.stroke * (ink ? 1.05 : 0.9)}
      />
    </svg>
  );
};

// ── charts ─────────────────────────────────────────────────────────────────

const CurveEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'curve' }> }> = ({
  el,
  t,
  look,
}) => {
  if (t < el.at) return null;
  const { x, y, w, h } = el;
  const axes: Pt[] = [
    { x, y: y - 6 },
    { x, y: y + h },
    { x: x + w + 14, y: y + h + 1 },
  ];
  const dense: Pt[] = [];
  for (let k = 0; k <= 20; k++) {
    const a = k <= 10 ? (axes[0] as Pt) : (axes[1] as Pt);
    const b = k <= 10 ? (axes[1] as Pt) : (axes[2] as Pt);
    const s = k <= 10 ? k / 10 : (k - 10) / 10;
    dense.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
  }
  const curve = easeCurvePoints(x + 10, y + 10, w - 30, h - 20);
  const pc = drawP(t, el.at + 0.25, 0.7);
  const end = curve[curve.length - 1] as Pt;
  const startPt = curve[0] as Pt;
  const ink = look.skin === 'ink';
  return (
    <svg style={svgAbs} overflow="visible">
      <Stroke
        d={wobblePath(dense, el.id, look.wobble)}
        p={drawP(t, el.at, 0.35)}
        color={look.ink}
        width={look.stroke * 0.9}
      />
      <Stroke
        d={wobblePath(curve, `${el.id}c`, look.wobble * 0.5)}
        p={pc}
        color={look.accent}
        width={look.stroke * 1.1}
      />
      {el.dotAt !== undefined && t >= el.dotAt && (
        <>
          <circle
            cx={startPt.x}
            cy={startPt.y}
            r={7}
            fill={look.card}
            stroke={look.ink}
            strokeWidth={2}
          />
          <circle
            cx={end.x}
            cy={end.y}
            r={20}
            fill="none"
            stroke={look.ink}
            strokeWidth={2}
            strokeDasharray={ink ? '5 6' : '4 7'}
            opacity={drawP(t, el.dotAt, 0.3)}
          />
          <circle
            cx={end.x}
            cy={end.y}
            r={7}
            fill={look.card}
            stroke={look.ink}
            strokeWidth={2}
            opacity={drawP(t, el.dotAt, 0.2)}
          />
        </>
      )}
    </svg>
  );
};

const TracksEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'tracks' }> }> = ({
  el,
  t,
  look,
}) => {
  if (t < el.at) return null;
  const rows = 3;
  const play = interpolate(t, [el.playAt, el.playAt + 1.3], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ink = look.skin === 'ink';
  const headX = el.x + el.w * (0.08 + play * 0.86);
  return (
    <svg style={svgAbs} overflow="visible">
      {Array.from({ length: rows }, (_, i) => {
        const y = el.y + 30 + i * ((el.h - 60) / (rows - 1));
        const keys = [0.12, 0.5 + seeded(el.id, i) * 0.2, 0.9 - i * 0.12];
        return (
          <g key={i}>
            <Stroke
              d={wobblePath(
                [
                  { x: el.x, y },
                  { x: el.x + el.w, y: y + 1 },
                ],
                `${el.id}${i}`,
                look.wobble * 0.6,
              )}
              p={drawP(t, el.at + i * 0.1, 0.3)}
              color={look.muted}
              width={2.6}
            />
            {keys.map((k, j) => {
              const kx = el.x + el.w * k;
              const kp = drawP(t, el.at + 0.25 + i * 0.1 + j * 0.06, 0.2);
              const lit = headX >= kx;
              const r = 9 * kp;
              return (
                <path
                  key={j}
                  d={`M${kx} ${y - r} L${kx + r} ${y} L${kx} ${y + r} L${kx - r} ${y} Z`}
                  fill={lit ? look.accent : ink ? look.card : look.cardRaised}
                  stroke={lit ? look.accent : look.ink}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        );
      })}
      <Stroke
        d={`M${headX.toFixed(1)} ${el.y - 6} L${headX.toFixed(1)} ${el.y + el.h + 6}`}
        p={drawP(t, el.playAt - 0.1, 0.2)}
        color={look.accent}
        width={look.stroke}
      />
    </svg>
  );
};

// ── notes ──────────────────────────────────────────────────────────────────

const NoteEl: React.FC<DrawProps & { el: Extract<BoardElement, { kind: 'note' }> }> = ({
  el,
  t,
  fps,
  look,
}) => {
  if (t < el.at) return null;
  const s =
    t >= el.at + 0.8
      ? 1
      : spring({
          frame: Math.round((t - el.at) * fps),
          fps,
          config: { stiffness: 210, damping: 17, mass: 0.8 },
        });
  const ink = look.skin === 'ink';
  const width = el.width ?? 190;
  const height = el.height ?? 230;
  const size = el.size ?? (ink ? 32 : 24);
  const lines = wrapBoardText(el.title, size, width - 40, !ink);
  return (
    <div
      style={{
        position: 'absolute',
        left: el.width === undefined ? el.x - width / 2 : el.x,
        top: el.height === undefined ? el.y - height / 2 : el.y,
        width,
        height,
        transform: `translateY(${(1 - s) * -70}px) rotate(${el.rot + (1 - s) * 9}deg)`,
        opacity: Math.min(1, s * 2.2),
        background: look.noteFill,
        borderRadius: ink ? 3 : 18,
        border: `1.5px solid ${look.cardBorder}`,
        boxShadow: `0 ${8 + (1 - s) * 26}px ${16 + (1 - s) * 30}px ${look.shadow}`,
        padding: '30px 20px 20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: width / 2 - 38,
          top: -12,
          width: 76,
          height: 26,
          background: look.tape,
          borderRadius: ink ? 0 : 7,
          transform: `rotate(${(seeded(el.id, 1) - 0.5) * (ink ? 8 : 0)}deg)`,
        }}
      />
      <div
        style={{
          fontFamily: ink ? look.hand : look.mono,
          fontWeight: 600,
          fontSize: size,
          color: look.noteText,
          lineHeight: 1.2,
        }}
      >
        {lines.map((line, i) => (
          <div key={`${i}-${line}`}>{line}</div>
        ))}
      </div>
    </div>
  );
};

// ── dispatcher ─────────────────────────────────────────────────────────────

export const svgAbs: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  overflow: 'visible',
};

export const BoardElementView: React.FC<DrawProps & { el: BoardElement }> = ({ el, ...rest }) => {
  switch (el.kind) {
    case 'frame':
      return <FrameEl el={el} {...rest} />;
    case 'text':
      return <TextEl el={el} {...rest} />;
    case 'counter':
      return <CounterEl el={el} {...rest} />;
    case 'arrow':
      return <ArrowEl el={el} {...rest} />;
    case 'ring':
      return <RingEl el={el} {...rest} />;
    case 'neq':
      return <NeqEl el={el} {...rest} />;
    case 'glyph':
      return <GlyphEl el={el} {...rest} />;
    case 'curve':
      return <CurveEl el={el} {...rest} />;
    case 'tracks':
      return <TracksEl el={el} {...rest} />;
    case 'note':
      return <NoteEl el={el} {...rest} />;
  }
};
