/**
 * Definition scene — a dictionary card on warm paper. On `termAt` the card
 * slides up and the big serif term settles in, an optional tag pill pops
 * under it and a thin rule draws across. From `meaningAt` the meaning types
 * in word by word, each word rising softly out of a blur.
 *
 * No item reaction targets (whole-scene pulses are handled by SceneFrame).
 */

import type React from 'react';
import { interpolate, spring } from 'remotion';
import { floatTransform, useFloat, useLivingShadow } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { DefinitionScene as DefinitionSceneData } from './types';

const CARD_W = 900;
const PAD_X = 64;
const TEXT_W = CARD_W - PAD_X * 2;
/** Seconds between words as the meaning types in. */
const WORD_STAGGER = 0.065;

/** Instrument Serif is narrow (~0.37em per glyph); keep the term on one line. */
function termFont(term: string): number {
  return Math.max(64, Math.min(132, TEXT_W / Math.max(1, term.length * 0.37)));
}

function meaningFont(meaning: string): number {
  if (meaning.length > 56) return 44;
  if (meaning.length > 36) return 48;
  return 54;
}

export const DefinitionScene: React.FC<{ scene: DefinitionSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const float = useFloat('definition', 3);
  const shadow = useLivingShadow('definition', 0.9);

  const termAt = scene.termAt;
  const meaningAt = Math.max(scene.meaningAt, termAt + 0.2);

  const card = spring({
    frame: frame - Math.round(termAt * fps),
    fps,
    config: { stiffness: 130, damping: 18, mass: 1 },
  });
  const shown = t >= termAt;
  const termIn = ramp(t, termAt + 0.08, 0.7);
  const tagPop = usePop(termAt + 0.3, 220, 14);
  const rule = ramp(t, termAt + 0.22, 0.8);

  const ink = S.paperText;
  const soft = mixHex(S.paperText, S.paper, 0.42);
  const accentInk = mixHex(S.accent, S.paperText, 0.28);
  const words = scene.meaning.split(/\s+/).filter((w) => w.length > 0);
  const mFont = meaningFont(scene.meaning);
  const tFont = termFont(scene.term);
  const typed = interpolate(t, [meaningAt, meaningAt + 0.2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
          boxSizing: 'border-box',
          padding: `58px ${PAD_X}px 64px`,
          borderRadius: 40,
          background: `linear-gradient(170deg, ${mixHex(S.paper, '#ffffff', 0.35)} 0%, ${S.paper} 100%)`,
          boxShadow: `${shadow}, 0 2px 0 ${withAlpha('#ffffff', 0.6)} inset`,
          opacity: shown ? Math.min(1, card * 1.5) : 0,
          transform: `${floatTransform(float)} translateY(${((1 - card) * 120).toFixed(2)}px) rotate(${((1 - card) * -2.5).toFixed(3)}deg)`,
        }}
      >
        {/* Accent spine on the card's left edge. */}
        <div
          style={{
            position: 'absolute',
            left: 30,
            top: 62,
            bottom: 66,
            width: 6,
            borderRadius: 3,
            background: S.accent,
            transformOrigin: 'top center',
            transform: `scaleY(${rule.toFixed(4)})`,
          }}
        />
        <div
          style={{
            fontFamily: S.serif,
            fontWeight: 400,
            fontSize: tFont,
            lineHeight: 1,
            letterSpacing: `${((1 - termIn) * 0.06 - 0.01).toFixed(4)}em`,
            color: ink,
            whiteSpace: 'nowrap',
            opacity: termIn,
            transform: `translateY(${((1 - termIn) * 18).toFixed(2)}px)`,
            filter: termIn < 0.98 ? `blur(${((1 - termIn) * 8).toFixed(2)}px)` : undefined,
          }}
        >
          {scene.term}
        </div>
        {scene.tag && (
          <div style={{ marginTop: 20, display: 'flex' }}>
            <div
              style={{
                padding: '8px 22px 9px',
                borderRadius: 999,
                border: `2px solid ${withAlpha(accentInk, 0.55)}`,
                background: withAlpha(S.accent, 0.12),
                fontFamily: S.serif,
                fontStyle: 'italic',
                fontSize: 38,
                lineHeight: 1,
                color: accentInk,
                opacity: Math.min(1, tagPop * 1.5),
                transform: `scale(${(0.7 + tagPop * 0.3).toFixed(4)})`,
                transformOrigin: 'left center',
              }}
            >
              {scene.tag}
            </div>
          </div>
        )}
        <div
          style={{
            marginTop: 32,
            marginBottom: 34,
            height: 3,
            borderRadius: 2,
            background: withAlpha(S.paperText, 0.18),
            transformOrigin: 'left center',
            transform: `scaleX(${rule.toFixed(4)})`,
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 22,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              fontFamily: S.font,
              fontWeight: 800,
              fontSize: mFont * 0.72,
              lineHeight: `${(mFont * 1.28).toFixed(1)}px`,
              color: accentInk,
              opacity: typed,
            }}
          >
            1.
          </div>
          <div
            style={{
              fontFamily: S.font,
              fontWeight: 550,
              fontSize: mFont,
              lineHeight: 1.28,
              letterSpacing: '-0.012em',
              color: ink,
            }}
          >
            {words.map((w, i) => {
              const at = meaningAt + i * WORD_STAGGER;
              const p = ramp(t, at, 0.4);
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: words are positional
                  key={i}
                  style={{
                    display: 'inline-block',
                    marginRight: '0.26em',
                    opacity: p,
                    color: p < 1 ? mixHex(soft, ink, p) : ink,
                    transform: `translateY(${((1 - p) * 16).toFixed(2)}px)`,
                    filter: p < 0.98 ? `blur(${((1 - p) * 5).toFixed(2)}px)` : undefined,
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
