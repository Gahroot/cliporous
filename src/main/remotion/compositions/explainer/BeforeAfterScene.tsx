/**
 * Before/after scene — two cards stacked in place. The muted "before" card
 * shows on `beforeAt`; on `wipeAt` a glowing slider handle sweeps left → right
 * revealing the accent-tinted "after" card underneath, then a soft burst.
 */

import { Check, ChevronsLeftRight, X } from 'lucide-react';
import type React from 'react';
import { interpolate } from 'remotion';
import {
  Burst,
  EASE_IN_OUT_SOFT,
  floatTransform,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
  useVelocityBlur,
} from './motion';
import { withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import { type BeforeAfterScene as BeforeAfterSceneData, EXPLAINER_STAGE_HEIGHT } from './types';

const CARD_LEFT = 110;
const CARD_W = 860;
const CARD_H = 580;
const CARD_TOP = (EXPLAINER_STAGE_HEIGHT - CARD_H) / 2;
const RADIUS = 36;
const WIPE_SEC = 0.95;

/** Wipe progress 0→1 at scene time `t`. */
function wipeProgress(t: number, at: number): number {
  return interpolate(t, [at, at + WIPE_SEC], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_IN_OUT_SOFT,
  });
}

const Side: React.FC<{
  variant: 'before' | 'after';
  title: string;
  points: string[];
  revealAt: number;
}> = ({ variant, title, points, revealAt }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const after = variant === 'after';
  const tag = ramp(t, Math.max(0, revealAt - 0.25), 0.4);
  const head = ramp(t, revealAt, 0.45);
  const Mark = after ? Check : X;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '52px 60px',
        background: after
          ? `linear-gradient(150deg, ${withAlpha(S.accent, 0.3)} 0%, ${withAlpha(S.accent, 0.08)} 60%), ${S.cardRaised}`
          : S.card,
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
      <div
        style={{
          alignSelf: 'flex-start',
          padding: '8px 20px',
          borderRadius: 999,
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          color: after ? S.text : S.muted,
          background: after ? S.accent : withAlpha(S.muted, 0.16),
          opacity: tag,
        }}
      >
        {after ? 'After' : 'Before'}
      </div>
      <div
        style={{
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.05,
          color: after ? S.text : S.muted,
          opacity: head,
          transform: `translateY(${(1 - head) * 18}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 6 }}>
        {points.map((p, i) => {
          const enter = ramp(t, revealAt + 0.12 + i * 0.1, 0.45);
          return (
            <div
              key={`${i}-${p}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                opacity: enter,
                transform: `translateX(${(1 - enter) * -24}px)`,
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 16,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: after ? withAlpha(S.accent, 0.9) : withAlpha(S.muted, 0.14),
                }}
              >
                <Mark size={30} strokeWidth={3} color={after ? S.text : S.muted} />
              </div>
              <span
                style={{
                  fontFamily: S.font,
                  fontWeight: 650,
                  fontSize: 42,
                  color: after ? S.text : S.muted,
                  whiteSpace: 'nowrap',
                }}
              >
                {p}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const BeforeAfterScene: React.FC<{ scene: BeforeAfterSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, fps } = useSceneTime();
  const float = useFloat('before-after', 5);
  const shadow = useLivingShadow('before-after');
  const breath = useBreath('before-after');
  const beforeReaction = useReaction(0);
  const afterReaction = useReaction(1);

  const enter = ramp(t, 0, 0.55);
  const p = wipeProgress(t, scene.wipeAt);
  const handleX = p * CARD_W;
  const blur = useVelocityBlur((f) => wipeProgress(f / fps, scene.wipeAt) * CARD_W, 0.22);
  const handleIn = ramp(t, scene.wipeAt - 0.35, 0.35);
  const handleOut = ramp(t, scene.wipeAt + WIPE_SEC + 0.15, 0.4);
  const handleVis = handleIn * (1 - handleOut);
  const settle = usePop(scene.wipeAt + WIPE_SEC - 0.05, 220, 12);
  const settleBump = Math.sin(Math.min(1, settle) * Math.PI) * 0.025;
  const done = p >= 1;
  const reaction = done ? afterReaction : beforeReaction;
  // "before" desaturates a touch more once it's on screen.
  const desat = 0.55 - 0.15 * ramp(t, scene.beforeAt, 0.6);

  return (
    <div
      style={{
        position: 'absolute',
        left: CARD_LEFT,
        top: CARD_TOP,
        width: CARD_W,
        height: CARD_H,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px) ${floatTransform(float)} scale(${1 + settleBump}) ${reactionTransform(reaction)}`,
      }}
    >
      <Glow
        color={S.accentSoft}
        intensity={reaction.glow + (done ? 0.35 + breath * 0.25 : 0)}
        radius={260}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: RADIUS,
          overflow: 'hidden',
          boxShadow: shadow,
          border: `1.5px solid ${done ? withAlpha(S.accent, 0.55) : S.cardBorder}`,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, filter: `saturate(${desat})` }}>
          <Side
            variant="before"
            title={scene.before.title}
            points={scene.before.points}
            revealAt={Math.max(0.15, scene.beforeAt - 0.1)}
          />
        </div>
        {p > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: `inset(0 ${((1 - p) * 100).toFixed(3)}% 0 0)`,
            }}
          >
            <Side
              variant="after"
              title={scene.after.title}
              points={scene.after.points}
              revealAt={scene.wipeAt - 0.6}
            />
          </div>
        )}
      </div>

      {handleVis > 0.001 && (
        <div
          style={{
            position: 'absolute',
            left: handleX,
            top: -34,
            bottom: -34,
            width: 0,
            opacity: handleVis,
            filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -3,
              top: 0,
              bottom: 0,
              width: 6,
              borderRadius: 3,
              background: `linear-gradient(180deg, ${withAlpha(S.accent, 0)} 0%, ${S.accent} 18%, ${S.accent} 82%, ${withAlpha(S.accent, 0)} 100%)`,
              boxShadow: `0 0 24px ${withAlpha(S.accent, 0.9)}, 0 0 60px ${withAlpha(S.accent, 0.45)}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: -44,
              top: '50%',
              width: 88,
              height: 88,
              marginTop: -44,
              borderRadius: 44,
              background: S.accent,
              border: `4px solid ${S.text}`,
              boxShadow: `0 0 40px ${withAlpha(S.accent, 0.8)}, 0 16px 34px rgba(0,0,0,0.45)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${0.7 + handleIn * 0.3})`,
            }}
          >
            <ChevronsLeftRight size={44} strokeWidth={2.6} color={S.text} />
          </div>
        </div>
      )}
      <Burst
        atSec={scene.wipeAt + WIPE_SEC - 0.05}
        x={CARD_W - 40}
        y={CARD_H / 2}
        color={S.accent}
        radius={220}
        seed="before-after"
      />
    </div>
  );
};
