import type React from 'react';
import { withAlpha } from '../palette';
import { useSceneTime, useStage } from '../stage';
import { sampleStamp } from './motion';
import type { StampFinish } from './types';

/** A contact → surface impression, not a second burst or certification graphic. */
export function StampTreatment({
  word,
  at,
  finish,
  overlay = false,
}: {
  word: string;
  at: number;
  finish: StampFinish;
  overlay?: boolean;
}): React.ReactElement | null {
  const S = useStage();
  const { t } = useSceneTime();
  const p = sampleStamp(t, at, finish);
  if (!p.visible) return null;
  const embossed = finish === 'embossed';
  const fontSize = Math.min(overlay ? 94 : 112, 710 / Math.max(1, word.length * 0.65));
  const common: React.CSSProperties = {
    fontFamily: S.font,
    fontSize,
    fontWeight: 900,
    letterSpacing: '0.045em',
    whiteSpace: 'nowrap',
    lineHeight: 1.12,
    textTransform: 'uppercase',
  };
  return (
    <div
      data-editorial={finish}
      style={{
        position: 'absolute',
        left: '50%',
        top: overlay ? '72%' : 640,
        transform: `translate(-50%, -50%) rotate(${embossed ? -3 : -6}deg)`,
        ...common,
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: embossed ? '28px 46px' : '16px 38px',
          borderRadius: embossed ? 999 : 15,
          background: S.cardRaised,
          border: `2px solid ${S.cardBorder}`,
          transform: `translateY(${p.depression}px)`,
          boxShadow: `0 ${12 - p.depression * 2}px 28px ${withAlpha(S.bgOuter, 0.4)}`,
        }}
      >
        <span
          style={{
            position: 'relative',
            display: 'block',
            opacity: p.impression,
            padding: '6px 14px',
            border: `${embossed ? 5 : 4}px ${embossed ? 'double' : 'solid'} ${embossed ? S.cardBorder : S.accent}`,
            borderRadius: embossed ? 999 : 4,
            color: embossed ? S.accent2 : S.accent,
            textShadow: embossed
              ? `-1px -2px 1px ${withAlpha(S.text, 0.75)}, 2px 3px 1px ${withAlpha(S.bgOuter, 0.85)}`
              : `0 2px 0 ${withAlpha(S.text, 0.28)}, 0 -1px 1px ${withAlpha(S.bgOuter, 0.85)}`,
            boxShadow: embossed
              ? `inset 1px 2px 1px ${withAlpha(S.text, 0.35)}, 1px 2px 1px ${withAlpha(S.bgOuter, 0.65)}`
              : `inset 0 2px 2px ${withAlpha(S.bgOuter, 0.3)}`,
          }}
        >
          {word}
        </span>
        {embossed && p.highlight > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 4,
              borderRadius: 999,
              pointerEvents: 'none',
              opacity: p.highlight * 0.45,
              background: `linear-gradient(115deg, transparent ${p.highlightPosition * 115 - 25}%, ${withAlpha(S.text, 0.75)} ${p.highlightPosition * 115 - 9}%, transparent ${p.highlightPosition * 115 + 7}%)`,
            }}
          />
        )}
      </div>
      {p.dieOpacity > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: embossed ? 999 : 15,
            background: S.card,
            border: `5px solid ${S.accent}`,
            color: S.accent,
            opacity: p.dieOpacity,
            transform: `translateY(${-30 * (1 - p.press)}px) scale(${1 + (1 - p.press) * 0.14})`,
          }}
        >
          {word}
        </div>
      )}
    </div>
  );
}
