/**
 * Headline scene — a newspaper-style card: live dot + outlet in small caps,
 * a double masthead rule, the headline in a big serif and a few grey body
 * lines. The card whooshes in and slams down on `at` (scale 1.08 → 1, lands
 * at `at + 0.2` with a tiny decaying shake to match the thump), then a soft
 * highlight sheen sweeps across it once.
 */

import type React from 'react';
import { Easing, interpolate } from 'remotion';
import { floatTransform, Glow, useBreath, useFloat, useLivingShadow } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { HeadlineScene as HeadlineSceneData } from './types';

const CARD_W = 940;
/** Same timing as the `thump` cue (`at + 0.2`) in src/main/ai/explainer/kinds-story.ts. */
const LAND_SEC = 0.2;
const SHAKE_SEC = 0.35;
const SWEEP_DELAY = 0.45;
const SWEEP_SEC = 1.0;

function headlineFontSize(text: string): number {
  const n = text.length;
  if (n <= 22) return 120;
  if (n <= 36) return 108;
  if (n <= 50) return 96;
  return 88;
}

export const HeadlineScene: React.FC<{ scene: HeadlineSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const float = useFloat('headline', 3, 5.8);
  const shadow = useLivingShadow('headline', 1.3);
  const breath = useBreath('headline-live');

  const at = scene.at;
  // Slam: accelerate into the landing (ease-in), overshoot-free.
  const slam = interpolate(t, [at - 0.12, at + LAND_SEC], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const opacity = interpolate(t, [at - 0.12, at + 0.06], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const since = t - (at + LAND_SEC);
  const shakeDecay = since > 0 && since < SHAKE_SEC ? 1 - since / SHAKE_SEC : 0;
  const shakeX = Math.sin(since * 80) * 7 * shakeDecay;
  const shakeY = Math.cos(since * 64) * 3 * shakeDecay;
  const impact = since > 0 ? Math.exp(-since / 0.25) : 0;
  const scale = 1.08 - 0.08 * slam;
  const rotate = -1.2 + (1 - slam) * -2.5;

  const sweep = ramp(t, at + LAND_SEC + SWEEP_DELAY, SWEEP_SEC);
  const bodyIn = ramp(t, at + LAND_SEC + 0.1, 0.6);

  const paper = S.paper;
  const ink = S.paperText;
  const rule = mixHex(ink, paper, 0.15);
  const fontSize = headlineFontSize(scene.headline);

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: CARD_W,
          opacity,
          transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) ${floatTransform(float)} rotate(${rotate.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
        }}
      >
        <Glow color={S.accentSoft} intensity={0.45 + impact * 0.6} radius={320} />
        <div
          style={{
            position: 'relative',
            borderRadius: 30,
            padding: '44px 56px 50px',
            background: `linear-gradient(170deg, ${mixHex(paper, '#ffffff', 0.35)} 0%, ${paper} 100%)`,
            boxShadow: `${shadow}, 0 ${(8 + impact * 20).toFixed(1)}px ${(30 + impact * 40).toFixed(1)}px rgba(0,0,0,${(0.25 + impact * 0.2).toFixed(3)})`,
            overflow: 'hidden',
          }}
        >
          {/* Masthead */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px 8px 14px',
                  borderRadius: 12,
                  background: S.negative,
                  color: '#ffffff',
                  fontFamily: S.font,
                  fontWeight: 800,
                  fontSize: 24,
                  letterSpacing: '0.12em',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 7,
                    background: '#ffffff',
                    opacity: 0.55 + 0.45 * breath,
                    boxShadow: `0 0 ${(4 + breath * 8).toFixed(1)}px rgba(255,255,255,0.9)`,
                  }}
                />
                LIVE
              </div>
              <div
                style={{
                  fontFamily: S.font,
                  fontWeight: 800,
                  fontSize: 36,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontVariantCaps: 'small-caps',
                  color: ink,
                  whiteSpace: 'nowrap',
                }}
              >
                {scene.outlet}
              </div>
            </div>
            <div
              style={{
                fontFamily: S.font,
                fontWeight: 600,
                fontSize: 24,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: withAlpha(ink, 0.55),
                whiteSpace: 'nowrap',
              }}
            >
              Just now
            </div>
          </div>
          <div style={{ marginTop: 22, height: 5, background: rule }} />
          <div style={{ marginTop: 5, height: 2, background: rule }} />
          {/* Headline */}
          <div
            style={{
              marginTop: 30,
              fontFamily: S.serif,
              fontWeight: 400,
              fontSize,
              lineHeight: 1.02,
              letterSpacing: '-0.01em',
              color: ink,
            }}
          >
            {scene.headline}
          </div>
          {/* Body copy skeleton */}
          <div
            style={{
              marginTop: 34,
              display: 'flex',
              gap: 34,
              opacity: bodyIn,
              transform: `translateY(${((1 - bodyIn) * 12).toFixed(2)}px)`,
            }}
          >
            {[0, 1].map((col) => (
              <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[100, 92, col === 0 ? 70 : 84].map((w) => (
                  <div
                    key={`${col}-${w}`}
                    style={{
                      width: `${w}%`,
                      height: 14,
                      borderRadius: 7,
                      background: withAlpha(ink, 0.13),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Highlight sheen, sweeps once after the landing. */}
          {sweep > 0 && sweep < 1 && (
            <div
              style={{
                position: 'absolute',
                top: -100,
                bottom: -100,
                left: `${(-40 + sweep * 150).toFixed(2)}%`,
                width: '28%',
                transform: 'rotate(14deg)',
                background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${withAlpha(S.accent, 0.12)} 35%, rgba(255,255,255,0.55) 50%, ${withAlpha(S.accent, 0.12)} 65%, rgba(255,255,255,0) 100%)`,
                mixBlendMode: 'soft-light',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
