/**
 * Statement scene — a huge 1–3 word line in editorial serif. Each word rises
 * and unblurs on the beat the speaker says it; the accent word is italic in
 * the accent colour, lands with a small overshoot and breathes a soft glow.
 */

import type React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  EASE_OUT_SOFT,
  floatTransform,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useReaction,
} from './motion';
import { withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import { EXPLAINER_STAGE_WIDTH, type StatementScene as StatementSceneData } from './types';

const MAX_WIDTH = EXPLAINER_STAGE_WIDTH - 140;
const MAX_HEIGHT = 780;
const LINE_HEIGHT = 0.98;
const GAP_EM = 0.24;

/** Rough Instrument Serif advance width (em) — enough to pick a font size. */
function wordEm(text: string, italic: boolean): number {
  let w = 0;
  for (const ch of text) {
    if (/[mwMW]/.test(ch)) w += 0.62;
    else if (/[A-Z]/.test(ch)) w += 0.52;
    else if (/[fijlrt.,'!|]/.test(ch)) w += 0.26;
    else if (/[0-9]/.test(ch)) w += 0.46;
    else w += 0.4;
  }
  return w * (italic ? 0.97 : 1);
}

/** Greedy-wrap the words into lines and pick the largest font that fits. */
function fitType(widths: readonly number[]): { fontSize: number; lines: number[][] } {
  for (let fs = 360; fs >= 90; fs -= 6) {
    const lines: number[][] = [];
    let cur: number[] = [];
    let curW = 0;
    widths.forEach((w, i) => {
      const add = (cur.length ? GAP_EM : 0) + w;
      if (cur.length && (curW + add) * fs > MAX_WIDTH) {
        lines.push(cur);
        cur = [i];
        curW = w;
      } else {
        cur.push(i);
        curW += add;
      }
    });
    if (cur.length) lines.push(cur);
    const widest = Math.max(
      ...lines.map((l) => l.reduce((a, i, n) => a + (widths[i] ?? 0) + (n ? GAP_EM : 0), 0)),
    );
    if (widest * fs <= MAX_WIDTH && lines.length * fs * LINE_HEIGHT <= MAX_HEIGHT) {
      return { fontSize: fs, lines };
    }
  }
  return { fontSize: 90, lines: widths.map((_, i) => [i]) };
}

const Word: React.FC<{
  text: string;
  at: number;
  index: number;
  accent: boolean;
  fontSize: number;
}> = ({ text, at, index, accent, fontSize }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = useFloat(`statement${index}`, 5, 5.2);
  const breath = useBreath(`statement${index}`);
  const reaction = useReaction(index);

  // Reveal: soft rise + unblur, starting a hair before the word so it is
  // fully legible ON the beat.
  const start = at - 0.12;
  const p = EASE_OUT_SOFT(Math.min(1, Math.max(0, (t - start) / 0.55)));
  const rise = (1 - p) * fontSize * 0.28;
  const blur = (1 - p) * 18;
  // Landing: small overshoot (the accent word bounces a little harder).
  const s = spring({
    frame: frame - Math.round(start * fps),
    fps,
    config: accent
      ? { stiffness: 210, damping: 11, mass: 0.8 }
      : { stiffness: 170, damping: 16, mass: 0.9 },
  });
  const scale = interpolate(s, [0, 1], [accent ? 0.86 : 0.93, 1]);
  const lit = ramp(t, at, 0.6);
  const glow = accent ? lit * (0.45 + breath * 0.35) + reaction.glow : reaction.glow;

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        transform: `translateY(${rise.toFixed(2)}px) ${floatTransform(float)} scale(${scale.toFixed(4)}) ${reactionTransform(reaction)}`,
        transformOrigin: '50% 70%',
      }}
    >
      {accent && (
        <Glow color={withAlpha(S.accent, 0.55)} intensity={glow} radius={fontSize * 0.9} />
      )}
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          fontFamily: S.serif,
          fontStyle: accent ? 'italic' : 'normal',
          fontWeight: 400,
          fontSize,
          lineHeight: LINE_HEIGHT,
          letterSpacing: '-0.02em',
          color: accent ? S.accent : S.text,
          // Upcoming words wait as a faint blurred ghost.
          opacity: 0.08 + 0.92 * p,
          filter: blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : undefined,
          textShadow: accent
            ? `0 0 ${(28 + breath * 26).toFixed(1)}px ${withAlpha(S.accent, 0.35 * lit)}, 0 18px 50px rgba(0,0,0,0.35)`
            : '0 18px 50px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap',
          padding: accent ? '0 0.06em' : undefined,
        }}
      >
        {text}
      </span>
    </span>
  );
};

export const StatementScene: React.FC<{ scene: StatementSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const drift = useFloat('statement-rule', 3);
  const words = scene.words;
  const accentIndex = Math.min(
    words.length - 1,
    Math.max(0, scene.accentIndex ?? words.length - 1),
  );
  const { fontSize, lines } = fitType(words.map((w, i) => wordEm(w.text, i === accentIndex)));
  const accentAt = words[accentIndex]?.at ?? 0;
  const underline = ramp(t, accentAt + 0.15, 0.7);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {lines.map((line) => (
        <div
          key={line.join('-')}
          style={{ display: 'flex', justifyContent: 'center', gap: `${GAP_EM}em`, fontSize }}
        >
          {line.map((i) => {
            const w = words[i];
            return w ? (
              <Word
                key={`${i}-${w.text}`}
                text={w.text}
                at={w.at}
                index={i}
                accent={i === accentIndex}
                fontSize={fontSize}
              />
            ) : null;
          })}
        </div>
      ))}
      <div
        style={{
          marginTop: fontSize * 0.14,
          width: 150 * underline,
          height: 5,
          borderRadius: 3,
          background: S.accent,
          opacity: 0.85 * underline,
          boxShadow: `0 0 24px ${withAlpha(S.accent, 0.6)}`,
          transform: floatTransform(drift),
        }}
      />
    </div>
  );
};
