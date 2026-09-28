/**
 * Quote scene — a big accent opening quotation mark lands on `at`, the quote
 * reveals word by word in italic Instrument Serif, then on `authorAt` a thin
 * accent rule draws and the attribution (initials avatar + bold name + muted
 * role) slides in beneath it.
 */

import type React from 'react';
import { interpolate } from 'remotion';
import { floatTransform, Glow, useBreath, useFloat } from './motion';
import { withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { QuoteScene as QuoteSceneData } from './types';

const SIDE = 100;
const ATTR_H = 130;

/** Big and airy for one-liners, still ≤4 lines at the 90-char limit. */
function quoteFontSize(text: string): number {
  const n = text.length;
  if (n <= 24) return 118;
  if (n <= 45) return 100;
  if (n <= 68) return 88;
  return 80;
}

function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0 && !/^(jr|sr|ii|iii|iv|phd|md)$/i.test(w));
  const first = words[0]?.charAt(0) ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase() || '•';
}

/** Seconds between words: spread the reveal over the gap to the author beat. */
function wordStep(scene: QuoteSceneData, n: number): number {
  const span = Math.max(0.3, scene.authorAt - scene.at - 0.25);
  return Math.min(0.16, Math.max(0.05, (span * 0.85) / Math.max(1, n)));
}

const Word: React.FC<{ word: string; at: number }> = ({ word, at }) => {
  const { t } = useSceneTime();
  const p = ramp(t, at, 0.45);
  const blur = (1 - p) * 8;
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: p,
        transform: `translateY(${((1 - p) * 22).toFixed(2)}px)`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        marginRight: '0.22em',
      }}
    >
      {word}
    </span>
  );
};

const Attribution: React.FC<{ scene: QuoteSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const rule = interpolate(t, [scene.authorAt, scene.authorAt + 0.45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const avatar = usePop(scene.authorAt + 0.08, 200, 13);
  const slide = ramp(t, scene.authorAt + 0.12, 0.6);
  if (t < scene.authorAt) return <div style={{ height: ATTR_H }} />;
  return (
    <div style={{ height: ATTR_H, display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div
        style={{
          width: 110 * rule,
          height: 3,
          borderRadius: 2,
          background: S.accent,
          boxShadow: `0 0 12px ${withAlpha(S.accent, 0.5)}`,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            flexShrink: 0,
            background: `linear-gradient(160deg, ${S.clay[1]} 0%, ${S.clay[2]} 100%)`,
            boxShadow: '0 10px 26px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: 32,
            letterSpacing: 1,
            color: S.paperText,
            opacity: Math.min(1, avatar * 1.5),
            transform: `scale(${(0.5 + 0.5 * avatar).toFixed(4)})`,
          }}
        >
          {initialsOf(scene.author)}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            opacity: slide,
            transform: `translateX(${((1 - slide) * -36).toFixed(2)}px)`,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: S.font,
              fontWeight: 800,
              fontSize: 42,
              lineHeight: 1.15,
              color: S.text,
              whiteSpace: 'nowrap',
            }}
          >
            {scene.author}
          </div>
          {scene.role && (
            <div
              style={{
                fontFamily: S.font,
                fontWeight: 600,
                fontSize: 36,
                lineHeight: 1.2,
                color: S.muted,
                whiteSpace: 'nowrap',
              }}
            >
              {scene.role}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const QuoteScene: React.FC<{ scene: QuoteSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const float = useFloat('quote', 4, 5.4);
  const breath = useBreath('quote-mark');
  const mark = usePop(scene.at, 150, 12);
  const words = scene.text.split(/\s+/).filter((w) => w.length > 0);
  const step = wordStep(scene, words.length);
  const timed = words.map((word, i) => ({ word, at: scene.at + 0.15 + i * step }));
  const fontSize = quoteFontSize(scene.text);
  const lastWordAt = scene.at + 0.15 + Math.max(0, words.length - 1) * step;
  // Soft glow swell once the whole line has landed.
  const settled = ramp(t, lastWordAt + 0.2, 0.8);

  return (
    <div
      style={{
        position: 'absolute',
        left: SIDE,
        right: SIDE,
        top: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transform: floatTransform(float),
      }}
    >
      <div style={{ position: 'relative', height: 130, flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: -18,
            top: -40,
            width: 260,
            height: 260,
            opacity: Math.min(1, mark * 1.4),
            transform: `translateY(${((1 - mark) * 40).toFixed(2)}px) rotate(${((1 - mark) * -14).toFixed(2)}deg) scale(${(0.6 + 0.4 * mark).toFixed(4)})`,
            transformOrigin: '30% 60%',
          }}
        >
          <Glow color={S.accentSoft} intensity={0.45 + 0.35 * breath * settled} radius={130} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              fontFamily: S.serif,
              fontStyle: 'italic',
              fontSize: 380,
              lineHeight: 1,
              color: S.accent,
              textShadow: `0 0 40px ${withAlpha(S.accent, 0.45)}`,
            }}
          >
            “
          </div>
        </div>
      </div>
      <div
        style={{
          fontFamily: S.serif,
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize,
          lineHeight: 1.1,
          color: S.text,
          marginBottom: 40,
        }}
      >
        {timed.map((wd) => (
          <Word key={`${wd.at}-${wd.word}`} word={wd.word} at={wd.at} />
        ))}
      </div>
      <Attribution scene={scene} />
    </div>
  );
};
