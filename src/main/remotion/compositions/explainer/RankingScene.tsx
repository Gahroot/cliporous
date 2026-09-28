/**
 * Ranking scene — a top-N list. Empty numbered slots wait in rank order; each
 * item slides into ITS rank slot on the beat it is named (speaking order, not
 * rank order). The #1 row lands with an accent border, a breathing glow and a
 * crown.
 */

import { Crown } from 'lucide-react';
import type React from 'react';
import { Glow, reactionTransform, useBreath, useFloat, useReaction } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { RankingScene as RankingSceneData } from './types';

const LEFT = 110;
const WIDTH = 860;
const GAP = 18;
const TITLE_H = 96;

function rowHeightFor(count: number): number {
  if (count <= 3) return 150;
  return count === 4 ? 124 : 112;
}

const Slot: React.FC<{ rank: number; y: number; h: number; fade: number }> = ({
  rank,
  y,
  h,
  fade,
}) => {
  const S = useStage();
  if (fade <= 0.01) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: LEFT,
        top: y,
        width: WIDTH,
        height: h,
        borderRadius: 28,
        border: `2px dashed ${withAlpha(S.muted, 0.35)}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 26,
        opacity: fade,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          width: h - 40,
          textAlign: 'center',
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: 48,
          color: withAlpha(S.muted, 0.55),
        }}
      >
        {rank}
      </span>
    </div>
  );
};

const Row: React.FC<{
  label: string;
  rank: number;
  at: number;
  index: number;
  y: number;
  h: number;
  fontSize: number;
}> = ({ label, rank, at, index, y, h, fontSize }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const float = useFloat(`rank-${index}`, 2.5);
  const breath = useBreath(`rank-${index}`);
  const slide = usePop(at, 190, 17);
  const fadeIn = ramp(t, at, 0.25);
  const crown = usePop(at + 0.18, 240, 11);
  const top = rank === 1;
  const shown = t >= at;
  if (!shown) return null;

  const badge = h - 40;
  const glow = top ? 0.4 + breath * 0.35 + reaction.glow : reaction.glow;

  return (
    <div
      style={{
        position: 'absolute',
        left: LEFT,
        top: y,
        width: WIDTH,
        height: h,
        opacity: fadeIn,
        transform: `translateX(${((1 - slide) * 140).toFixed(2)}px) translateY(${float.y.toFixed(2)}px) ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={withAlpha(S.accent, top ? 0.55 : 0.4)} intensity={glow} radius={110} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 28,
          background: top
            ? `linear-gradient(100deg, ${mixHex(S.cardRaised, S.accent, 0.16)} 0%, ${S.cardRaised} 70%)`
            : S.cardRaised,
          border: top ? `3px solid ${S.accent}` : `1px solid ${S.cardBorder}`,
          boxShadow: top
            ? `0 0 ${(30 + breath * 20).toFixed(1)}px ${withAlpha(S.accent, 0.35)}, 0 22px 50px rgba(0,0,0,0.35)`
            : '0 18px 44px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 30,
          padding: '0 34px 0 20px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: badge,
            height: badge,
            flexShrink: 0,
            borderRadius: 22,
            background: top ? S.accent : withAlpha(S.accent, 0.14),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: badge * 0.56,
            color: top ? S.bgOuter : S.accent,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rank}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: S.font,
            fontWeight: 700,
            fontSize,
            color: S.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        {top && (
          <div
            style={{
              flexShrink: 0,
              transform: `scale(${crown.toFixed(4)}) rotate(${((1 - crown) * -25).toFixed(2)}deg)`,
              filter: `drop-shadow(0 0 14px ${withAlpha(S.accent, 0.7)})`,
            }}
          >
            <Crown size={58} strokeWidth={2.2} color={S.accent} fill={withAlpha(S.accent, 0.25)} />
          </div>
        )}
      </div>
    </div>
  );
};

export const RankingScene: React.FC<{ scene: RankingSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const titleIn = ramp(t, 0.05, 0.5);
  const slotsIn = ramp(t, 0.1, 0.5);

  const n = scene.items.length;
  const h = rowHeightFor(n);
  const titleH = scene.title ? TITLE_H : 0;
  const blockH = titleH + n * h + (n - 1) * GAP;
  const top0 = Math.round((960 - blockH) / 2);
  const rowsTop = top0 + titleH;
  // Slot y by rank (1 = top); ranks are dense 1..n from the planner but be safe.
  const longest = Math.max(...scene.items.map((it) => it.label.length));
  const fontSize = longest > 16 ? 46 : h >= 150 ? 54 : 50;
  const ranks = [...scene.items].map((it) => it.rank).sort((a, b) => a - b);
  const slotY = (rank: number): number => {
    const pos = Math.max(0, ranks.indexOf(rank));
    return rowsTop + pos * (h + GAP);
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {scene.title && (
        <div
          style={{
            position: 'absolute',
            left: LEFT,
            width: WIDTH,
            top: top0,
            height: TITLE_H - 24,
            display: 'flex',
            alignItems: 'center',
            fontFamily: S.font,
            fontWeight: 800,
            fontSize: 58,
            letterSpacing: '-0.02em',
            color: S.text,
            whiteSpace: 'nowrap',
            opacity: titleIn,
            transform: `translateY(${((1 - titleIn) * 18).toFixed(2)}px)`,
          }}
        >
          {scene.title}
        </div>
      )}
      {scene.items.map((it) => {
        const fade = slotsIn * (1 - ramp(t, it.at, 0.2));
        return <Slot key={`slot-${it.rank}`} rank={it.rank} y={slotY(it.rank)} h={h} fade={fade} />;
      })}
      {scene.items.map((it, i) => (
        <Row
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional (labels may repeat)
          key={`row-${i}-${it.label}`}
          label={it.label}
          rank={it.rank}
          at={it.at}
          index={i}
          y={slotY(it.rank)}
          h={h}
          fontSize={fontSize}
        />
      ))}
    </div>
  );
};
