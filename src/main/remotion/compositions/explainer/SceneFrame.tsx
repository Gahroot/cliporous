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
import { StampTreatment } from './editorial/StampTreatments';
import type { StampFinish } from './editorial/types';
import { isCausalHeroProp } from './hero-catalog';
import { centeredLongformBox, longformStaging, modelSpaceTransform } from './longform-stage-layout';
import { Burst, floatTransform, reactionTransform, useFloat, useReaction } from './motion';
import { motionProgress, settleOffset } from './motion-tokens';
import {
  ExplainerProvider,
  ramp,
  useExplainerContext,
  useLayout,
  useSceneTime,
  useStage,
} from './stage';
import {
  EXPLAINER_GLASS_RADIUS,
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  type ExplainerScene,
  isCausalSceneKind,
  type SceneExtras,
} from './types';

const OverlayStamp: React.FC<{ word: string; at: number; finish?: StampFinish }> = ({
  word,
  at,
  finish,
}) =>
  finish ? (
    <StampTreatment word={word} at={at} finish={finish} overlay />
  ) : (
    <LegacyOverlayStamp word={word} at={at} />
  );

const LegacyOverlayStamp: React.FC<{ word: string; at: number }> = ({ word, at }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const slam = motionProgress(frame, fps, at, 'stamp');
  if (slam <= 0) return null;
  const shake = settleOffset(t - at - 0.12) * 5;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '72%',
        transform: `translate(calc(-50% + ${shake}px), -50%) rotate(-7deg) scale(${2 - slam})`,
        opacity: Math.min(1, slam),
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
const GlassCard: React.FC<{ quiet: boolean }> = ({ quiet }) => {
  const S = useStage();
  const float = useFloat('glass', 4, 5.5);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: EXPLAINER_GLASS_RADIUS,
        background: `linear-gradient(160deg, ${S.cardRaised}f2 0%, ${S.card}eb 100%)`,
        border: `1.5px solid ${S.cardBorder}`,
        boxShadow: '0 50px 120px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        transform: quiet ? undefined : floatTransform(float),
      }}
    />
  );
};

export const SceneFrame: React.FC<{ scene: ExplainerScene; children: React.ReactNode }> = ({
  scene,
  children,
}) => {
  const layout = useLayout();
  const { presentation } = useExplainerContext();
  const { t } = useSceneTime();
  // Saved scenes may predate planner budgets; functional scenes remain free of global extras.
  const functional =
    isCausalSceneKind(scene.kind) ||
    (scene.kind === 'hero' && isCausalHeroProp(scene.prop)) ||
    (scene.kind === 'stamp' && !!scene.finish) ||
    ((scene.kind === 'hero' || scene.kind === 'statement') && !!scene.labelTreatment) ||
    (scene.kind === 'statement' && !!scene.semanticText) ||
    (scene.kind === 'number' && !!scene.presentation);
  const extras: SceneExtras = functional
    ? {}
    : scene.overlayStamp?.finish
      ? { overlayStamp: scene.overlayStamp }
      : scene;
  const { floating, longform } = layout;
  const nativeStage = !!longform && longformStaging(scene.kind) === 'native';
  const safe = longform && presentation ? centeredLongformBox(presentation) : layout.safe;
  const model = nativeStage && longform ? modelSpaceTransform(longform.model) : undefined;
  const scale =
    model?.scale ??
    Math.min(safe.width / EXPLAINER_STAGE_WIDTH, safe.height / EXPLAINER_STAGE_HEIGHT);
  const w = EXPLAINER_STAGE_WIDTH * scale;
  const h = EXPLAINER_STAGE_HEIGHT * scale;
  const left = model?.x ?? safe.x + (safe.width - w) / 2;
  const top = model?.y ?? safe.y + (safe.height - h) / 2;
  const dim = extras.dimAt === undefined || scene.kind === 'stack' ? 0 : ramp(t, extras.dimAt, 0.5);

  return (
    <ExplainerProvider value={{ extras, nativeStage }}>
      <SceneReactionLayer>
        {floating && (
          <div style={{ position: 'absolute', left, top, width: w, height: h }}>
            <GlassCard quiet={functional} />
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
          {extras.overlayStamp && <OverlayStamp {...extras.overlayStamp} />}
          {(extras.bursts ?? []).map((b, i) => (
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
