/**
 * Question scene — the question card slides in on the ask beat with a big,
 * softly bouncing accent "?" beside it. When the speaker answers, the card
 * flips on its Y axis (CSS 3D) to reveal the accent-tinted answer on the back,
 * with one soft burst as it lands.
 */

import type React from 'react';
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
  useVelocityBlur,
} from './motion';
import { withAlpha } from './palette';
import { ramp, useLayout, usePop, useSceneTime, useStage } from './stage';
import type { QuestionScene as QuestionSceneData } from './types';

const CARD_W = 660;
const CARD_H = 420;
const CARD_LEFT = 70;
const CARD_TOP = (960 - CARD_H) / 2;
const MARK_X = CARD_LEFT + CARD_W + (1080 - 60 - CARD_LEFT - CARD_W) / 2;
const MARK_Y = 480;

function slideSpring(frame: number, fps: number, atSec: number): number {
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { stiffness: 140, damping: 17 },
  });
}

function flipSpring(frame: number, fps: number, atSec: number): number {
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { stiffness: 90, damping: 13 },
  });
}

function fontSizeFor(text: string, base: number): number {
  const n = text.length;
  if (n > 44) return base * 0.8;
  if (n > 28) return base * 0.9;
  return base;
}

export const QuestionScene: React.FC<{ scene: QuestionSceneData }> = ({ scene }) => {
  const S = useStage();
  const { floating } = useLayout();
  const { t, frame, fps } = useSceneTime();
  const reaction = useReaction(0);
  const float = useFloat('question-card', 5);
  const markFloat = useFloat('question-mark', 8);
  const breath = useBreath('question');
  const shadow = useLivingShadow('question');

  const askAt = scene.askAt;
  const answerAt = scene.answer !== undefined ? scene.answerAt : undefined;

  // Card slide-in from the left on the ask beat.
  const slide = slideSpring(frame, fps, askAt);
  const slideX = (1 - slide) * -180;
  const blur = useVelocityBlur((f) => (1 - slideSpring(f, fps, askAt)) * -180);

  // 3D flip on the answer beat (spring overshoot = the landing bounce).
  const flip = answerAt === undefined ? 0 : flipSpring(frame, fps, answerAt);
  const rotY = flip * 180;
  const flipBlur = useVelocityBlur((f) =>
    answerAt === undefined ? 0 : flipSpring(f, fps, answerAt) * 180,
  );
  // Lift the card toward the viewer mid-flip.
  const lift = Math.sin(Math.min(1, Math.max(0, flip)) * Math.PI);
  const answered = answerAt !== undefined && t >= answerAt;
  const landAt = answerAt === undefined ? -1 : answerAt + 0.38;

  // "?" — pops in just after the card, then bounces softly; calms once answered.
  const markIn = usePop(askAt + 0.15, 180, 11);
  const calm = answerAt === undefined ? 0 : ramp(t, answerAt, 0.5);
  const bounceT = Math.max(0, t - askAt - 0.3);
  const bouncePhase = (bounceT / 1.1) % 1;
  const hop = Math.abs(Math.sin(bouncePhase * Math.PI));
  const bounceY = -hop * 34 * (1 - calm * 0.7);
  // Squash at the bottom of each hop.
  const squash = 1 - (1 - hop) ** 6 * 0.08 * (1 - calm);
  const markScale = markIn * (1 - calm * 0.22);
  const markOpacity = 1 - calm * 0.55;

  const qSize = fontSizeFor(scene.question, 58);
  const aSize = fontSizeFor(scene.answer ?? '', 76);

  const face: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 40,
    padding: '44px 48px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 22,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.font,
    fontWeight: 700,
    fontSize: 26,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Card with 3D flip. */}
      <div
        style={{
          position: 'absolute',
          left: CARD_LEFT,
          top: CARD_TOP,
          width: CARD_W,
          height: CARD_H,
          opacity: Math.min(1, slide * 1.4),
          transform: `translateX(${slideX.toFixed(2)}px) ${floatTransform(float)} ${reactionTransform(reaction)}`,
          filter:
            blur + flipBlur * 0.3 > 0.05
              ? `blur(${(blur + flipBlur * 0.3).toFixed(2)}px)`
              : undefined,
          perspective: 1600,
        }}
      >
        <Glow
          color={S.accentSoft}
          intensity={Math.max(reaction.glow, answered ? 0.55 + breath * 0.35 : 0)}
          radius={200}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${(lift * 90).toFixed(2)}px) rotateY(${rotY.toFixed(3)}deg)`,
          }}
        >
          {/* Front: the question. */}
          <div
            style={{
              ...face,
              background: floating
                ? withAlpha(S.cardRaised, 0.92)
                : `linear-gradient(165deg, ${S.cardRaised} 0%, ${S.card} 100%)`,
              border: `1.5px solid ${S.cardBorder}`,
              boxShadow: floating
                ? 'inset 0 1px 0 rgba(255,255,255,0.06)'
                : `${shadow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}
          >
            <div style={{ ...labelStyle, color: S.muted }}>Question</div>
            <div
              style={{
                fontFamily: S.font,
                fontWeight: 700,
                fontSize: qSize,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: S.text,
              }}
            >
              {scene.question}
            </div>
          </div>
          {/* Back: the answer, accent tinted. */}
          {scene.answer !== undefined && (
            <div
              style={{
                ...face,
                transform: 'rotateY(180deg)',
                background: `linear-gradient(165deg, ${withAlpha(S.accent, 0.3)} 0%, ${withAlpha(S.accent, 0.12)} 100%), ${S.cardRaised}`,
                border: `2px solid ${withAlpha(S.accent, 0.6)}`,
                boxShadow: `${shadow}, 0 0 ${(40 + breath * 30).toFixed(1)}px ${withAlpha(S.accent, 0.3)}, inset 0 1px 0 rgba(255,255,255,0.1)`,
              }}
            >
              <div style={{ ...labelStyle, color: S.accent }}>Answer</div>
              <div
                style={{
                  fontFamily: S.serif,
                  fontWeight: 400,
                  fontSize: aSize,
                  lineHeight: 1.05,
                  letterSpacing: '-0.01em',
                  color: S.text,
                }}
              >
                {scene.answer}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The bouncing "?". */}
      <div
        style={{
          position: 'absolute',
          left: MARK_X - 130,
          top: MARK_Y - 170,
          width: 260,
          height: 300,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          opacity: markOpacity * Math.min(1, markIn * 1.5),
          transform: `${floatTransform(markFloat)} translateY(${bounceY.toFixed(2)}px) scale(${markScale.toFixed(4)})`,
        }}
      >
        <Glow color={S.accentSoft} intensity={0.6 + breath * 0.4} radius={180} />
        <div
          style={{
            position: 'relative',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: 280,
            lineHeight: 1,
            color: S.accent,
            transformOrigin: '50% 100%',
            transform: `scale(${(2 - squash).toFixed(4)}, ${squash.toFixed(4)})`,
            textShadow: `0 0 ${(30 + breath * 26).toFixed(1)}px ${withAlpha(S.accent, 0.65)}, 0 18px 40px rgba(0,0,0,0.35)`,
          }}
        >
          ?
        </div>
      </div>
      {/* Contact shadow under the "?". */}
      <div
        style={{
          position: 'absolute',
          left: MARK_X - 70,
          top: MARK_Y + 150,
          width: 140,
          height: 22,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)',
          filter: 'blur(10px)',
          opacity: markIn * markOpacity * (0.4 + (1 - hop) * 0.5),
          transform: `scaleX(${(1.1 - hop * 0.35).toFixed(3)})`,
        }}
      />

      {answerAt !== undefined && (
        <Burst
          atSec={landAt}
          x={CARD_LEFT + CARD_W / 2}
          y={CARD_TOP + CARD_H / 2}
          color={S.accent}
          seed="question"
          radius={300}
        />
      )}
    </div>
  );
};
