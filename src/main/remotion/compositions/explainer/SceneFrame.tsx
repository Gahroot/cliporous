/**
 * SceneFrame — places the 1080×960 virtual stage inside the current layout's
 * safe box and draws the cross-kind extras:
 *  - `over` layout: a floating frosted card behind the content (transparent
 *    canvas; the speaker shows around it);
 *  - `overlayStamp`: a stamp that lands on top of the running scene later
 *    ("YES, BUT" over the flow cube in the reference edit);
 *  - `dimAt`: the whole scene dims (e.g. "broken");
 *  - `bursts`: light particle bursts on big moments;
 *  - whole-scene emphasis reactions (pulses without a target).
 */

import type React from 'react';
import { interpolate } from 'remotion';
import { Burst, floatTransform, reactionTransform, useFloat, useReaction } from './motion';
import { ExplainerProvider, ramp, useLayout, useSceneTime, useStage } from './stage';
import { EXPLAINER_STAGE_HEIGHT, EXPLAINER_STAGE_WIDTH, type ExplainerScene } from './types';

const OverlayStamp: React.FC<{ word: string; at: number }> = ({ word, at }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const slam = interpolate(t, [at, at + 0.16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (slam <= 0) return null;
  const since = t - (at + 0.16);
  const shake = since > 0 && since < 0.3 ? Math.sin(since * 90) * 8 * (1 - since / 0.3) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '72%',
        transform: `translate(calc(-50% + ${shake}px), -50%) rotate(-7deg) scale(${2 - slam})`,
        opacity: slam,
        border: `8px solid ${S.accent}`,
        borderRadius: 20,
        padding: '4px 34px 0',
        fontFamily: S.font,
        fontWeight: 900,
        fontSize: 104,
        letterSpacing: 5,
        color: S.accent,
        background: 'rgba(0,0,0,0.18)',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        lineHeight: 1.05,
      }}
    >
      {word}
    </div>
  );
};

/** Frosted floating card for the transparent `over` layout. */
const GlassCard: React.FC = () => {
  const S = useStage();
  const float = useFloat('glass', 4, 5.5);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 56,
        background: `linear-gradient(160deg, ${S.cardRaised}f2 0%, ${S.card}eb 100%)`,
        border: `1.5px solid ${S.cardBorder}`,
        boxShadow: '0 50px 120px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        transform: floatTransform(float),
      }}
    />
  );
};

export const SceneFrame: React.FC<{ scene: ExplainerScene; children: React.ReactNode }> = ({
  scene,
  children,
}) => {
  const layout = useLayout();
  const { t } = useSceneTime();
  const { safe, floating } = layout;
  const scale = Math.min(safe.width / EXPLAINER_STAGE_WIDTH, safe.height / EXPLAINER_STAGE_HEIGHT);
  const w = EXPLAINER_STAGE_WIDTH * scale;
  const h = EXPLAINER_STAGE_HEIGHT * scale;
  const left = safe.x + (safe.width - w) / 2;
  const top = safe.y + (safe.height - h) / 2;
  const dim = scene.dimAt === undefined || scene.kind === 'stack' ? 0 : ramp(t, scene.dimAt, 0.5);

  return (
    <ExplainerProvider value={{ extras: scene }}>
      <SceneReactionLayer>
        {floating && (
          <div style={{ position: 'absolute', left, top, width: w, height: h }}>
            <GlassCard />
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            left,
            top,
            width: EXPLAINER_STAGE_WIDTH,
            height: EXPLAINER_STAGE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            opacity: 1 - dim * 0.55,
            filter: dim > 0.01 ? `saturate(${1 - dim * 0.7})` : undefined,
          }}
        >
          {children}
          {scene.overlayStamp && (
            <OverlayStamp word={scene.overlayStamp.word} at={scene.overlayStamp.at} />
          )}
          {(scene.bursts ?? []).map((b, i) => (
            <Burst
              key={`burst-${b.at}-${i}`}
              atSec={b.at}
              x={EXPLAINER_STAGE_WIDTH / 2}
              y={EXPLAINER_STAGE_HEIGHT / 2}
              color={'#ffffff'}
              seed={`scene-burst-${i}`}
            />
          ))}
        </div>
      </SceneReactionLayer>
    </ExplainerProvider>
  );
};

const SceneReactionLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const reaction = useReaction(undefined);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: reactionTransform(reaction),
        transformOrigin: '50% 45%',
      }}
    >
      {children}
    </div>
  );
};
