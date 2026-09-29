/**
 * Search scene — a search-engine pill bar (magnifier + blinking caret) sits
 * on the stage; from `typeAt` the query types in char by char. If there are
 * results, on `resultsAt` the bar glides up and 1–3 result cards (accent
 * link-coloured title + grey url/snippet skeleton lines) slide in staggered.
 */

import { Search } from 'lucide-react';
import type React from 'react';
import { spring } from 'remotion';
import { MaskRise } from './graphic-accents';
import { floatTransform, Glow, useBreath, useFloat, useLivingShadow } from './motion';
import { motionProgress } from './motion-tokens';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { SearchScene as SearchSceneData } from './types';

const BAR_W = 940;
const BAR_H = 128;
const BAR_LEFT = (1080 - BAR_W) / 2;
const BAR_TOP_CENTER = (960 - BAR_H) / 2;
const BAR_TOP_UP = 70;
const CARD_H = 172;
const CARD_GAP = 22;
const RESULTS_GAP = 34;
/** Same typing speed (s/char) as `typed` in searchSpec, src/main/ai/explainer/kinds-story.ts. */
const SEC_PER_CHAR = 0.045;
const STAGGER = 0.14;

function queryFontSize(q: string): number {
  const n = q.length;
  if (n <= 18) return 52;
  if (n <= 26) return 48;
  if (n <= 31) return 44;
  return 40;
}

const ResultCard: React.FC<{ text: string; index: number; at: number; top: number }> = ({
  text,
  index,
  at,
  top,
}) => {
  const S = useStage();
  const { frame, fps } = useSceneTime();
  const s = motionProgress(frame, fps, at + index * STAGGER);
  if (s <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: BAR_LEFT,
        width: BAR_W,
        top,
        height: CARD_H,
        boxSizing: 'border-box',
        padding: '26px 40px',
        borderRadius: 30,
        background: S.card,
        border: `1.5px solid ${S.cardBorder}`,
        boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
        opacity: Math.min(1, s * 1.5),
        transform: `translateY(${((1 - s) * 60).toFixed(2)}px) scale(${(0.96 + 0.04 * s).toFixed(4)})`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            background: `linear-gradient(160deg, ${S.clay[1]} 0%, ${S.clay[2]} 100%)`,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            width: 170 + ((index * 53) % 90),
            height: 13,
            borderRadius: 7,
            background: withAlpha(S.muted, 0.45),
          }}
        />
      </div>
      <div
        style={{
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: 40,
          lineHeight: 1.1,
          color: mixHex(S.accent, '#ffffff', 0.18),
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <MaskRise text={text} at={at + index * STAGGER} />
      </div>
      <div
        style={{
          width: `${86 - index * 9}%`,
          height: 14,
          borderRadius: 7,
          background: withAlpha(S.muted, 0.3),
        }}
      />
    </div>
  );
};

export const SearchScene: React.FC<{ scene: SearchSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const float = useFloat('search', 3, 5.6);
  const shadow = useLivingShadow('search', 1.1);
  const breath = useBreath('search-focus');

  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const n = scene.query.length;
  const typedChars =
    t < scene.typeAt ? 0 : Math.min(n, Math.floor((t - scene.typeAt) / SEC_PER_CHAR) + 1);
  const typing = typedChars > 0 && typedChars < n;
  // Solid caret while typing; frame-driven blink (0.5 s on / 0.5 s off) otherwise.
  const caretOn = typing || Math.floor(t * 2) % 2 === 0;
  const focus = ramp(t, scene.typeAt - 0.1, 0.3);

  const hasResults = scene.results.length > 0 && scene.resultsAt !== undefined;
  const resultsAt = scene.resultsAt ?? Number.POSITIVE_INFINITY;
  const lift = hasResults
    ? spring({
        frame: frame - Math.round(resultsAt * fps) + 2,
        fps,
        config: { damping: 18, stiffness: 140 },
      })
    : 0;
  // Pressing "enter" — a brief press-in of the bar on the results beat.
  const press = hasResults && t >= resultsAt ? Math.exp(-(t - resultsAt) / 0.12) : 0;

  // Centre the bar + results block vertically once results land.
  const count = scene.results.length;
  const block = BAR_H + RESULTS_GAP + count * CARD_H + Math.max(0, count - 1) * CARD_GAP;
  const upTop = Math.max(BAR_TOP_UP, (960 - block) / 2);
  const barTop = BAR_TOP_CENTER + (upTop - BAR_TOP_CENTER) * lift;
  const fontSize = queryFontSize(scene.query);
  const ink = S.paperText;

  return (
    <div style={{ position: 'absolute', inset: 0, transform: floatTransform(float) }}>
      <div
        style={{
          position: 'absolute',
          left: BAR_LEFT,
          top: barTop,
          width: BAR_W,
          height: BAR_H,
          opacity: Math.min(1, enter * 1.4),
          transform: `translateY(${((1 - enter) * 40).toFixed(2)}px) scale(${(1 - press * 0.025).toFixed(4)})`,
        }}
      >
        <Glow
          color={S.accentSoft}
          intensity={focus * (0.4 + 0.25 * breath) + press * 0.5}
          radius={260}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: BAR_H / 2,
            background: `linear-gradient(180deg, ${mixHex(S.paper, '#ffffff', 0.4)} 0%, ${S.paper} 100%)`,
            boxShadow: `${shadow}, 0 0 0 ${(focus * 5).toFixed(2)}px ${withAlpha(S.accent, 0.55 * focus)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            padding: '0 48px 0 44px',
            boxSizing: 'border-box',
          }}
        >
          <Search
            size={50}
            strokeWidth={2.8}
            color={withAlpha(ink, 0.55)}
            style={{ flexShrink: 0 }}
          />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              fontFamily: S.font,
              fontWeight: 500,
              fontSize,
              color: ink,
              whiteSpace: 'pre',
              overflow: 'hidden',
            }}
          >
            {typedChars === 0 && t < scene.typeAt && (
              <span style={{ color: withAlpha(ink, 0.38) }}>Search</span>
            )}
            <span>{scene.query.slice(0, typedChars)}</span>
            {t >= scene.typeAt - 0.1 && (
              <span
                style={{
                  display: 'inline-block',
                  width: 4,
                  height: fontSize * 1.1,
                  marginLeft: 4,
                  borderRadius: 2,
                  background: S.accent,
                  opacity: caretOn && t < resultsAt ? 1 : 0,
                }}
              />
            )}
          </div>
        </div>
      </div>
      {hasResults &&
        scene.results.map((r, i) => (
          <ResultCard
            key={r}
            text={r}
            index={i}
            at={resultsAt}
            top={upTop + BAR_H + RESULTS_GAP + i * (CARD_H + CARD_GAP)}
          />
        ))}
    </div>
  );
};
