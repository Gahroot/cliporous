/**
 * Notes scene — the "Human calls" card: a dark raised card with a title and
 * an optional accent badge. Every line waits as a shimmering skeleton bar and
 * types itself in (with an accent caret) on the beat the speaker says it.
 *
 * Typing motion adapted from Remocn typewriter (MIT).
 */

import type React from 'react';
import {
  floatTransform,
  Glow,
  hash01,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { withAlpha } from './palette';
import { ramp, useLayout, usePop, useSceneTime, useStage } from './stage';
import type { NotesScene as NotesSceneData } from './types';

const CARD_WIDTH = 840;
const ROW_HEIGHT = 86;
const TEXT_SIZE = 42;
/** Chars per second; long lines type faster so they finish in ~0.8 s. */
const MIN_CPS = 26;
const TYPE_SEC = 0.8;

/** Characters typed at `t` and whether the caret is still typing. */
function typed(text: string, at: number, t: number): { shown: string; typing: boolean } {
  const chars = Array.from(text);
  const cps = Math.max(MIN_CPS, chars.length / TYPE_SEC);
  const n = t < at ? 0 : Math.min(chars.length, Math.floor((t - at) * cps) + 1);
  return { shown: chars.slice(0, n).join(''), typing: t >= at && n < chars.length };
}

const Line: React.FC<{
  text: string;
  at: number;
  index: number;
  focused: boolean;
}> = ({ text, at, index, focused }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const breath = useBreath(`notes${index}`);
  const enter = ramp(t, 0.2 + index * 0.07, 0.45);
  const bullet = usePop(at, 260, 12);
  const { shown, typing } = typed(text, at, t);
  const started = t >= at;
  const since = t - at;
  const skeletonOut = ramp(t, at, 0.3);
  const barWidth = 0.52 + hash01(`notes-bar${index}`) * 0.4;
  // Deterministic shimmer sweep, offset per row.
  const sweep = (((t * 0.7 + index * 0.18) % 1) + 1) % 1;
  // Caret: solid while typing, then blinks twice and leaves.
  const caretOn = typing || (started && since < 1.6 && Math.floor(since * 3) % 2 === 0);
  const highlight = focused ? ramp(t, at, 0.3) : 0;

  return (
    <div
      style={{
        position: 'relative',
        height: ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        padding: '0 22px',
        borderRadius: 20,
        opacity: enter,
        transform: `translateY(${((1 - enter) * 18).toFixed(2)}px) ${reactionTransform(reaction)}`,
        background: highlight > 0 ? withAlpha(S.accent, 0.08 * highlight) : undefined,
        boxShadow:
          highlight > 0 ? `inset 0 0 0 1.5px ${withAlpha(S.accent, 0.28 * highlight)}` : undefined,
      }}
    >
      <Glow color={S.accentSoft} intensity={reaction.glow} radius={90} />
      {/* Bullet: hollow ring → accent dot on the beat. */}
      <div style={{ position: 'relative', width: 18, height: 18, flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 9,
            border: `2.5px solid ${withAlpha(S.text, 0.22)}`,
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 9,
            background: S.accent,
            transform: `scale(${bullet.toFixed(4)})`,
            boxShadow: `0 0 ${(10 + (focused ? breath * 12 : 0)).toFixed(1)}px ${withAlpha(S.accent, 0.8)}`,
          }}
        />
      </div>
      <div style={{ position: 'relative', flex: 1, height: ROW_HEIGHT }}>
        {skeletonOut < 1 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: ROW_HEIGHT / 2 - 14,
              height: 28,
              width: `${(barWidth * 100).toFixed(1)}%`,
              borderRadius: 14,
              opacity: 1 - skeletonOut,
              transform: `scaleX(${(1 - skeletonOut * 0.25).toFixed(4)})`,
              transformOrigin: 'right center',
              backgroundColor: withAlpha(S.text, 0.07),
              backgroundImage: `linear-gradient(100deg, ${withAlpha(S.text, 0)} 0%, ${withAlpha(S.text, 0.11)} 50%, ${withAlpha(S.text, 0)} 100%)`,
              backgroundSize: '45% 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `${(-60 + sweep * 220).toFixed(1)}% 0`,
            }}
          />
        )}
        {started && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: ROW_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              fontFamily: S.font,
              fontWeight: 600,
              fontSize: TEXT_SIZE,
              letterSpacing: '-0.01em',
              color: S.text,
              whiteSpace: 'pre',
            }}
          >
            {shown}
            <span
              style={{
                display: 'inline-block',
                width: 4,
                height: TEXT_SIZE * 1.05,
                marginLeft: 4,
                borderRadius: 2,
                background: S.accent,
                opacity: caretOn ? 1 : 0,
                boxShadow: `0 0 12px ${withAlpha(S.accent, 0.7)}`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const NotesScene: React.FC<{ scene: NotesSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const float = useFloat('notes', 5);
  const badgeFloat = useFloat('notes-badge', 3);
  const shadow = useLivingShadow('notes');
  const { floating } = useLayout();
  const enter = ramp(t, 0, 0.5);
  const badgePop = usePop(0.3, 220, 12);
  const titleIn = ramp(t, 0.08, 0.45);
  let focusIndex = -1;
  scene.lines.forEach((l, i) => {
    if (t >= l.at) focusIndex = i;
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: (1080 - CARD_WIDTH) / 2,
        width: CARD_WIDTH,
        top: '50%',
        transform: `translateY(-50%) translateY(${((1 - enter) * 30).toFixed(2)}px) ${floatTransform(float)}`,
        opacity: enter,
        borderRadius: 40,
        padding: '34px 30px 30px',
        background: floating
          ? undefined
          : `linear-gradient(170deg, ${S.cardRaised} 0%, ${S.card} 100%)`,
        border: floating ? undefined : `1.5px solid ${S.cardBorder}`,
        boxShadow: floating ? undefined : `${shadow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: '0 22px 24px',
          marginBottom: 14,
          borderBottom: `1.5px solid ${S.cardBorder}`,
        }}
      >
        <div
          style={{
            fontFamily: S.font,
            fontWeight: 750,
            fontSize: 50,
            letterSpacing: '-0.02em',
            color: S.text,
            whiteSpace: 'nowrap',
            opacity: titleIn,
            transform: `translateX(${((1 - titleIn) * -16).toFixed(2)}px)`,
          }}
        >
          {scene.title}
        </div>
        {scene.badge && (
          <div
            style={{
              flexShrink: 0,
              padding: '10px 24px',
              borderRadius: 999,
              background: withAlpha(S.accent, 0.16),
              border: `1.5px solid ${withAlpha(S.accent, 0.45)}`,
              color: S.accent,
              fontFamily: S.font,
              fontWeight: 700,
              fontSize: 30,
              whiteSpace: 'nowrap',
              transform: `scale(${badgePop.toFixed(4)}) ${floatTransform(badgeFloat)}`,
              boxShadow: `0 0 26px ${withAlpha(S.accent, 0.25)}`,
            }}
          >
            {scene.badge}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {scene.lines.map((l, i) => (
          <Line
            key={`${l.at}-${l.text}`}
            text={l.text}
            at={l.at}
            index={i}
            focused={i === focusIndex}
          />
        ))}
      </div>
    </div>
  );
};
