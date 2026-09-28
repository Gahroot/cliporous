/**
 * Receipt scene — a paper receipt hangs from a printer slot and "prints"
 * downward: the header is there from the entrance, each line item
 * (label ······ amount) feeds out on its beat, then a divider draws and a bold
 * TOTAL thumps in on `totalAt`. Torn zig-zag bottom edge, tabular numbers.
 */

import type React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { floatTransform, reactionTransform, useFloat, useReaction } from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, useSceneTime, useStage } from './stage';
import type { ReceiptScene as ReceiptSceneData } from './types';

/** Same timing as the `thump` cue (totalAt + 0.1) in src/main/ai/explainer/kinds-money.ts. */
const THUMP_DELAY = 0.1;

const PAPER_W = 760;
const PAD_X = 50;
const PAD_TOP = 40;
const HEADER_H = 118;
const LINE_H = 74;
const TOTAL_H = 150;
const PAD_BOTTOM = 34;
const TOOTH_W = 28;
const TOOTH_H = 16;
const SLOT_H = 28;

/** Soft feed spring (no visible overshoot — paper does not bounce). */
function useFeed(atSec: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { stiffness: 140, damping: 22, mass: 0.8 },
  });
}

const Line: React.FC<{ label: string; amount: string; at: number; index: number }> = ({
  label,
  amount,
  at,
  index,
}) => {
  const S = useStage();
  const { t } = useSceneTime();
  const feed = useFeed(at);
  const reaction = useReaction(index);
  const ink = ramp(t, at + 0.05, 0.35);
  const inkColor = S.paperText;
  return (
    <div style={{ height: LINE_H * feed, position: 'relative' }}>
      {t >= at && (
        <div
          style={{
            position: 'absolute',
            left: -14,
            right: -14,
            top: 0,
            height: LINE_H,
            padding: '0 14px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'baseline',
            paddingTop: 12,
            boxSizing: 'border-box',
            background: withAlpha(S.accent, 0.16 * reaction.glow),
            opacity: ink,
            transform: `translateY(${((1 - ink) * -10).toFixed(2)}px) ${reactionTransform(reaction)}`,
          }}
        >
          <span
            style={{
              fontFamily: S.font,
              fontWeight: 600,
              fontSize: 40,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: inkColor,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
          <div
            style={{
              flex: 1,
              minWidth: 24,
              margin: '0 14px',
              borderBottom: `4px dotted ${withAlpha(inkColor, 0.3)}`,
            }}
          />
          <span
            style={{
              fontFamily: S.font,
              fontWeight: 700,
              fontSize: 42,
              fontVariantNumeric: 'tabular-nums',
              color: inkColor,
              whiteSpace: 'nowrap',
            }}
          >
            {amount}
          </span>
        </div>
      )}
    </div>
  );
};

export const ReceiptScene: React.FC<{ scene: ReceiptSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const float = useFloat('receipt', 4);
  const totalFeed = useFeed(scene.totalAt);

  const n = scene.lines.length;
  const finalH = PAD_TOP + HEADER_H + n * LINE_H + TOTAL_H + PAD_BOTTOM;
  const slotY = Math.round((960 - (finalH + TOOTH_H + SLOT_H * 0.5)) / 2);
  const paperLeft = (1080 - PAPER_W) / 2;

  const enter = ramp(t, 0.05, 0.5);
  // Header feeds out with the entrance.
  const headerFeed = interpolate(enter, [0, 1], [0.35, 1]);

  // Total: divider draws, then the line lands with a thump (scale 1.35 → 1).
  const divider = ramp(t, scene.totalAt, 0.35);
  const k = frame - Math.round(scene.totalAt * fps);
  const land = spring({ frame: k, fps, config: { stiffness: 320, damping: 19, mass: 0.7 } });
  const totalShown = t >= scene.totalAt;
  const totalScale = interpolate(land, [0, 1], [1.4, 1]);
  const thumpK = frame - Math.round((scene.totalAt + THUMP_DELAY) * fps);
  const thump = thumpK >= 0 ? Math.exp(-thumpK / 5) * Math.sin(thumpK * 0.9) * 7 : 0;
  const accentInk = mixHex(S.accent, S.paperText, 0.18);

  const teeth = Math.ceil(PAPER_W / TOOTH_W);
  const toothPath = [
    'M0 0',
    ...Array.from({ length: teeth }, (_, i) => {
      const x0 = i * TOOTH_W;
      return `L${x0 + TOOTH_W / 2} ${TOOTH_H} L${Math.min(PAPER_W, x0 + TOOTH_W)} 0`;
    }),
    'Z',
  ].join(' ');

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: enter }}>
      {/* Paper (below the slot) */}
      <div
        style={{
          position: 'absolute',
          left: paperLeft,
          top: slotY + SLOT_H / 2,
          width: PAPER_W,
          transform: `translateY(${thump.toFixed(2)}px) ${floatTransform({ ...float, y: 0, x: 0 })}`,
          transformOrigin: '50% 0%',
          filter: 'drop-shadow(0 26px 40px rgba(0,0,0,0.38))',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: PAPER_W,
            background: `linear-gradient(180deg, ${mixHex(S.paper, S.paperText, 0.1)} 0px, ${S.paper} 36px, ${S.paper} 100%)`,
            padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
            boxSizing: 'border-box',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: HEADER_H * headerFeed,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontFamily: S.font,
                fontWeight: 800,
                fontSize: 44,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: S.paperText,
                whiteSpace: 'nowrap',
                lineHeight: 1.1,
              }}
            >
              {scene.title}
            </div>
            <div
              style={{
                marginTop: 18,
                width: '100%',
                borderTop: `3px dashed ${withAlpha(S.paperText, 0.3)}`,
              }}
            />
          </div>
          {scene.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional (labels may repeat)
            <Line key={`${i}-${l.label}`} label={l.label} amount={l.amount} at={l.at} index={i} />
          ))}
          <div style={{ height: TOTAL_H * totalFeed, position: 'relative', flexShrink: 0 }}>
            {totalShown && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 22,
                    width: `${(divider * 100).toFixed(2)}%`,
                    height: 10,
                    borderTop: `3px solid ${S.paperText}`,
                    borderBottom: `3px solid ${S.paperText}`,
                    boxSizing: 'border-box',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 52,
                    height: 84,
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    opacity: Math.min(1, land * 1.6),
                    transform: `scale(${totalScale.toFixed(4)})`,
                    transformOrigin: '50% 50%',
                  }}
                >
                  <span
                    style={{
                      fontFamily: S.font,
                      fontWeight: 800,
                      fontSize: 46,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: S.paperText,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {scene.total.label}
                  </span>
                  <span
                    style={{
                      fontFamily: S.font,
                      fontWeight: 800,
                      fontSize: 66,
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                      color: accentInk,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {scene.total.amount}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <svg
          aria-hidden="true"
          width={PAPER_W}
          height={TOOTH_H}
          viewBox={`0 0 ${PAPER_W} ${TOOTH_H}`}
          style={{ display: 'block', marginTop: -1 }}
        >
          <path d={toothPath} fill={S.paper} />
        </svg>
      </div>
      {/* Printer slot */}
      <div
        style={{
          position: 'absolute',
          left: paperLeft - 40,
          top: slotY,
          width: PAPER_W + 80,
          height: SLOT_H,
          borderRadius: SLOT_H / 2,
          background: `linear-gradient(180deg, ${S.cardRaised} 0%, ${S.bgOuter} 100%)`,
          border: `1px solid ${S.cardBorder}`,
          boxShadow: `0 12px 30px rgba(0,0,0,0.45), inset 0 -6px 10px rgba(0,0,0,0.45)`,
        }}
      />
    </div>
  );
};
