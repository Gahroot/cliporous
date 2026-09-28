/**
 * Spectrum scene — a wide gradient track (muted → accent) between two end
 * labels, with tick marks. A marker (+ optional pill label) pops in at `from`
 * on `showAt`, then glides to `to` on `moveAt` with a soft spring overshoot,
 * leaving a faint ghost where it started. The end label nearest the marker
 * brightens.
 */

import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { floatTransform, Glow, useBreath, useFloat } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { SpectrumScene as SpectrumSceneData } from './types';

const TRACK_X = 130;
const TRACK_W = 820;
const TRACK_Y = 500;
const TRACK_H = 36;
const MARKER = 100;
const TICKS = 11;
const PILL_FONT = 44;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export const SpectrumScene: React.FC<{ scene: SpectrumSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = useFloat('spectrum', 4);
  const breath = useBreath('spectrum');

  const from = clamp01(scene.from);
  const to = clamp01(scene.to);
  const enter = ramp(t, 0.05, 0.55);
  const show = usePop(scene.showAt, 220, 13);
  const pillIn = usePop(scene.showAt + 0.1, 200, 14);
  const shown = t >= scene.showAt;

  const moveAt = (f: number): number =>
    spring({
      frame: f - Math.round(scene.moveAt * fps),
      fps,
      config: { stiffness: 80, damping: 10.5, mass: 1 },
    });
  const m = moveAt(frame);
  const pos = from + (to - from) * m;
  const vel = (to - from) * (m - moveAt(frame - 1)) * TRACK_W; // px per frame
  const stretch = Math.min(0.12, Math.abs(vel) * 0.006);
  const markerX = TRACK_X + pos * TRACK_W;
  const moving = t >= scene.moveAt;
  const trail = moving ? clamp01(1 - ramp(t, scene.moveAt + 0.9, 1.2) * 0.55) : 0;

  const pillText = scene.markerLabel;
  const pillW = pillText ? pillText.length * PILL_FONT * 0.6 + 76 : 0;
  const pillCenter = Math.min(1020 - pillW / 2, Math.max(60 + pillW / 2, markerX));
  const tilt = Math.max(-6, Math.min(6, -vel * 0.35));

  const endLabel = (text: string, side: 'left' | 'right'): React.ReactNode => {
    const near = side === 'left' ? 1 - pos : pos;
    const lit = shown ? clamp01((near - 0.5) * 2.2) : 0;
    const accentSide = side === 'right';
    return (
      <div
        style={{
          position: 'absolute',
          top: TRACK_Y + TRACK_H / 2 + 70,
          ...(side === 'left' ? { left: TRACK_X - 20 } : { right: 1080 - TRACK_X - TRACK_W - 20 }),
          width: 460,
          textAlign: side,
          fontFamily: S.font,
          fontWeight: 750,
          fontSize: text.length > 9 ? 50 : 58,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          color: mixHex(S.muted, accentSide ? S.accent : S.text, 0.35 + lit * 0.65),
          opacity: ramp(t, 0.15, 0.5),
        }}
      >
        {text}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: enter,
        transform: `translateY(${((1 - enter) * 24).toFixed(2)}px) ${floatTransform({ ...float, rotate: 0 })}`,
      }}
    >
      {/* Track */}
      <div
        style={{
          position: 'absolute',
          left: TRACK_X,
          top: TRACK_Y - TRACK_H / 2,
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          background: `linear-gradient(90deg, ${mixHex(S.cardRaised, S.muted, 0.35)} 0%, ${mixHex(S.muted, S.accent, 0.45)} 55%, ${S.accent} 100%)`,
          boxShadow: `inset 0 2px 0 ${withAlpha('#ffffff', 0.14)}, inset 0 -4px 8px rgba(0,0,0,0.25), 0 16px 40px rgba(0,0,0,0.35)`,
        }}
      />
      {/* Trail from start to marker */}
      {moving && Math.abs(markerX - (TRACK_X + from * TRACK_W)) > 2 && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(markerX, TRACK_X + from * TRACK_W),
            top: TRACK_Y - TRACK_H / 2 + 5,
            width: Math.abs(markerX - (TRACK_X + from * TRACK_W)),
            height: TRACK_H - 10,
            borderRadius: TRACK_H,
            background: withAlpha('#ffffff', 0.35 * trail),
          }}
        />
      )}
      {/* Ticks */}
      {Array.from({ length: TICKS }, (_, i) => {
        const x = TRACK_X + (i / (TICKS - 1)) * TRACK_W;
        const major = i === 0 || i === TICKS - 1 || i === (TICKS - 1) / 2;
        const tickIn = ramp(t, 0.12 + i * 0.03, 0.4);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed tick row
            key={i}
            style={{
              position: 'absolute',
              left: x - 2,
              top: TRACK_Y + TRACK_H / 2 + 16,
              width: 4,
              height: major ? 28 : 16,
              borderRadius: 2,
              background: withAlpha(S.muted, major ? 0.8 : 0.45),
              opacity: tickIn,
              transform: `scaleY(${tickIn.toFixed(3)})`,
              transformOrigin: '50% 0%',
            }}
          />
        );
      })}
      {endLabel(scene.left, 'left')}
      {endLabel(scene.right, 'right')}
      {/* Ghost of the start position */}
      {moving && (
        <div
          style={{
            position: 'absolute',
            left: TRACK_X + from * TRACK_W - MARKER * 0.32,
            top: TRACK_Y - MARKER * 0.32,
            width: MARKER * 0.64,
            height: MARKER * 0.64,
            borderRadius: '50%',
            border: `4px solid ${withAlpha(S.text, 0.45)}`,
            boxSizing: 'border-box',
            opacity: ramp(t, scene.moveAt, 0.3),
          }}
        />
      )}
      {shown && (
        <>
          {/* Marker */}
          <div
            style={{
              position: 'absolute',
              left: markerX - MARKER / 2,
              top: TRACK_Y - MARKER / 2,
              width: MARKER,
              height: MARKER,
              transform: `scale(${(show * (1 + stretch)).toFixed(4)}, ${(show * (1 - stretch * 0.5)).toFixed(4)})`,
            }}
          >
            <Glow
              color={withAlpha(S.accent, 0.7)}
              intensity={0.45 + breath * 0.3 + Math.min(0.5, Math.abs(vel) * 0.05)}
              radius={MARKER}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${S.text} 55%, ${mixHex(S.text, S.accent, 0.3)} 100%)`,
                border: `8px solid ${S.accent}`,
                boxSizing: 'border-box',
                boxShadow: `0 14px 30px rgba(0,0,0,0.45), 0 0 0 6px ${withAlpha(S.accent, 0.18)}`,
              }}
            />
          </div>
          {/* Pill */}
          {pillText && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: pillCenter - pillW / 2,
                  top: TRACK_Y - MARKER / 2 - 118,
                  width: pillW,
                  height: 82,
                  borderRadius: 41,
                  background: S.accent,
                  color: S.bgOuter,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: S.font,
                  fontWeight: 750,
                  fontSize: PILL_FONT,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 16px 36px rgba(0,0,0,0.4), 0 0 30px ${withAlpha(S.accent, 0.35)}`,
                  opacity: Math.min(1, pillIn * 1.5),
                  transform: `translateY(${((1 - pillIn) * 18).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${(0.8 + 0.2 * pillIn).toFixed(4)})`,
                  transformOrigin: `${(markerX - (pillCenter - pillW / 2)).toFixed(1)}px 100%`,
                }}
              >
                {pillText}
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: markerX - 14,
                  top: TRACK_Y - MARKER / 2 - 40,
                  width: 0,
                  height: 0,
                  borderLeft: '14px solid transparent',
                  borderRight: '14px solid transparent',
                  borderTop: `16px solid ${S.accent}`,
                  opacity: Math.min(1, pillIn * 1.5),
                  transform: `translateY(${((1 - pillIn) * 18).toFixed(2)}px)`,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};
