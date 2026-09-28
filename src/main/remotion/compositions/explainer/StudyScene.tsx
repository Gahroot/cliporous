/**
 * Study scene — a research "paper" card. On `sourceAt` the card slides up
 * with the source line (document / graduation-cap badge) while faint text
 * skeleton lines hint at the finding. On `findingAt` the skeleton gives way to
 * the finding, a key phrase gets an accent marker sweep behind it, and the
 * optional big stat lands above the finding with a bounce + burst.
 *
 * No item reaction targets (whole-scene pulses are handled by SceneFrame).
 */

import { FileText, GraduationCap } from 'lucide-react';
import type React from 'react';
import { interpolate } from 'remotion';
import { Burst, floatTransform, Glow, useBreath, useFloat, useLivingShadow } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { StudyScene as StudySceneData } from './types';

const CARD_W = 920;
const PAD_X = 60;
const ACADEMIC =
  /\b(univ|university|college|school|institute|harvard|stanford|mit|oxford|cambridge|yale|princeton|berkeley|professor|phd)\b/i;
/** Comparison words that usually carry a finding ("more productive", "twice as likely"). */
const KEY = new Set(
  'more less most least twice half double triple times higher lower faster slower better worse likely'.split(
    ' ',
  ),
);
const STOP = new Set(
  'a an the of to in on at for and or but is are was were be been by with that this than as it its their our your who which from into'.split(
    ' ',
  ),
);

/** Contiguous run of up to 3 words worth highlighting (numbers win, then long content words). */
function keyPhrase(words: readonly string[]): [number, number] {
  const score = (w: string): number => {
    const clean = w.toLowerCase().replace(/[^a-z0-9%$]/g, '');
    if (/\d/.test(clean)) return 12;
    if (KEY.has(clean)) return 8;
    if (STOP.has(clean)) return 0.5;
    return Math.min(clean.length, 10);
  };
  const len = Math.min(3, words.length);
  let best: [number, number] = [0, len];
  let bestScore = -1;
  for (let i = 0; i + len <= words.length; i++) {
    // Slight preference for later words: findings usually end on the payoff.
    let s = i * 0.3;
    for (let k = i; k < i + len; k++) s += score(words[k] ?? '');
    // Do not start or end the marker on a filler word.
    if (score(words[i] ?? '') < 1) s -= 4;
    if (score(words[i + len - 1] ?? '') < 1) s -= 4;
    if (s > bestScore) {
      bestScore = s;
      best = [i, i + len];
    }
  }
  return best;
}

function findingFont(finding: string, hasStat: boolean): number {
  const n = finding.length;
  if (n > 52) return hasStat ? 44 : 48;
  if (n > 32) return hasStat ? 48 : 54;
  return hasStat ? 54 : 62;
}

export const StudyScene: React.FC<{ scene: StudySceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const float = useFloat('study', 5);
  const statFloat = useFloat('study-stat', 4);
  const shadow = useLivingShadow('study', 0.9);
  const breath = useBreath('study');

  const sourceAt = scene.sourceAt;
  const findingAt = Math.max(scene.findingAt, sourceAt + 0.2);
  const card = interpolate(
    frame,
    [Math.round(sourceAt * fps), Math.round(sourceAt * fps) + 1],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  const slide = ramp(t, sourceAt, 0.7);
  const badge = ramp(t, sourceAt + 0.15, 0.5);
  const reveal = ramp(t, findingAt, 0.5);
  const skeleton = 1 - ramp(t, findingAt, 0.3);
  const sweepAt = findingAt + 0.35;
  const sweep = interpolate(t, [sweepAt, sweepAt + 0.55], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (x) => 1 - (1 - x) ** 3,
  });

  // Stat: damped bounce on the finding beat (same land beat as the "pop" cue).
  const k = frame - Math.round(findingAt * fps);
  const statIn = k >= 0 ? Math.min(1, k / 6) : 0;
  const statScale = k >= 0 ? 1 - Math.exp(-k / 6) * Math.cos(k * 0.45) * 0.45 : 0.5;
  const statGlow = ramp(t, findingAt, 0.6) * (0.35 + breath * 0.3);

  const Icon = ACADEMIC.test(scene.source) ? GraduationCap : FileText;
  const words = scene.finding.split(/\s+/).filter((w) => w.length > 0);
  const [hs, he] = keyPhrase(words);
  const fFont = findingFont(scene.finding, scene.stat !== undefined);
  const markerInk = withAlpha(S.accent, 0.45);

  const before = words.slice(0, hs).join(' ');
  const key = words.slice(hs, he).join(' ');
  const after = words.slice(he).join(' ');

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
          padding: `48px ${PAD_X}px 58px`,
          borderRadius: 38,
          background: `linear-gradient(165deg, ${S.cardRaised} 0%, ${S.card} 100%)`,
          border: `1.5px solid ${S.cardBorder}`,
          boxShadow: `${shadow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
          opacity: card * Math.min(1, slide * 1.6),
          transform: `${floatTransform(float)} translateY(${((1 - slide) * 90).toFixed(2)}px)`,
        }}
      >
        {/* Source row. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              flexShrink: 0,
              borderRadius: 22,
              background: withAlpha(S.accent, 0.18),
              border: `2px solid ${withAlpha(S.accent, 0.5)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: badge,
              transform: `scale(${(0.6 + badge * 0.4).toFixed(4)}) rotate(${((1 - badge) * -12).toFixed(2)}deg)`,
            }}
          >
            <Icon size={42} strokeWidth={1.9} color={S.accent} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div
              style={{
                fontFamily: S.font,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: S.muted,
              }}
            >
              Source
            </div>
            <div
              style={{
                fontFamily: S.font,
                fontWeight: 700,
                fontSize: scene.source.length > 20 ? 38 : 42,
                letterSpacing: '-0.01em',
                color: S.text,
                whiteSpace: 'nowrap',
              }}
            >
              {scene.source}
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 30,
            marginBottom: 30,
            height: 2,
            background: withAlpha(S.text, 0.1),
          }}
        />

        {/* Finding area: skeleton lines until the finding beat. */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
              paddingTop: 12,
              opacity: skeleton * slide,
            }}
          >
            {[0.94, 0.82, 0.58].map((w) => (
              <div
                key={w}
                style={{
                  width: `${w * 100}%`,
                  height: 22,
                  borderRadius: 11,
                  background: withAlpha(S.text, 0.07),
                }}
              />
            ))}
          </div>

          {scene.stat && (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                marginBottom: 6,
                opacity: statIn,
                transform: `${floatTransform(statFloat)} scale(${statScale.toFixed(4)})`,
                transformOrigin: 'left 70%',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Glow color={withAlpha(S.accent, 0.7)} intensity={statGlow} radius={150} />
                <div
                  style={{
                    position: 'relative',
                    fontFamily: S.font,
                    fontWeight: 800,
                    fontSize: 150,
                    lineHeight: 1.02,
                    letterSpacing: '-0.04em',
                    color: mixHex(S.accent, '#ffffff', 0.25),
                    textShadow: `0 0 36px ${withAlpha(S.accent, 0.45)}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {scene.stat}
                </div>
                <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
                  <Burst
                    atSec={findingAt}
                    x={0}
                    y={0}
                    color={S.accent}
                    seed="study"
                    radius={220}
                    count={14}
                  />
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              position: 'relative',
              minHeight: 134,
              fontFamily: S.font,
              fontWeight: 600,
              fontSize: fFont,
              lineHeight: 1.3,
              letterSpacing: '-0.015em',
              color: S.text,
              opacity: reveal,
              transform: `translateY(${((1 - reveal) * 22).toFixed(2)}px)`,
            }}
          >
            {before && <span>{before} </span>}
            <span
              style={{
                backgroundImage: `linear-gradient(100deg, ${markerInk} 0%, ${markerInk} 100%)`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${sweep.toFixed(2)}% 62%`,
                backgroundPosition: '0 78%',
                padding: '0 0.08em',
                margin: '0 -0.08em',
                borderRadius: 6,
              }}
            >
              {key}
            </span>
            {after && <span> {after}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
