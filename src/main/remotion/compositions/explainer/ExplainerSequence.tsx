/**
 * ExplainerSequence — one or more chained explainer scenes rendered as ONE
 * continuous piece of stage video.
 *
 *  - The backdrop (palette gradient + drifting key light) is mounted once, so
 *    it keeps living across chained scenes instead of resetting per scene.
 *  - Scenes are joined with TransitionSeries transitions (grow / slide / fade).
 *  - The whole stage slides up + scales in on entry and scales away on exit
 *    (skipped on edges that continue into another sequence).
 *  - `over` renders on a transparent canvas (ProRes 4444 alpha).
 */

import { TransitionSeries } from '@remotion/transitions';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { longformClipPath } from './longform-stage-layout';
import { useStageEnterExit } from './motion';
import { SceneBody } from './SceneBody';
import { SceneFrame } from './SceneFrame';
import { ExplainerFonts, ExplainerProvider, StageBackground } from './stage';
import { scenePresentation, sceneTiming } from './transitions';
import type { ExplainerSequenceProps } from './types';

const StageContent: React.FC<ExplainerSequenceProps> = ({
  scenes,
  transitions,
  enter,
  exit,
  visibleSec,
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const motion = useStageEnterExit(enter, exit, visibleSec ?? durationInFrames / fps);
  return (
    <AbsoluteFill style={motion}>
      <TransitionSeries>
        {scenes.map((s, i) => {
          const tr = transitions[i];
          const key = `${i}-${s.scene.kind}`;
          return (
            <React.Fragment key={key}>
              <TransitionSeries.Sequence durationInFrames={s.durationInFrames}>
                <SceneFrame scene={s.scene}>
                  <SceneBody scene={s.scene} />
                </SceneFrame>
              </TransitionSeries.Sequence>
              {tr && i < scenes.length - 1 && (
                <TransitionSeries.Transition
                  presentation={scenePresentation(tr.kind)}
                  timing={sceneTiming(tr.kind, tr.durationInFrames)}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const ExplainerSequence: React.FC<ExplainerSequenceProps> = (props) => {
  const ctx = React.useMemo(
    () => ({
      palette: props.palette,
      layout: props.layout,
      aspect: props.aspect,
      safe: props.safeBox,
      presentation: props.presentation,
    }),
    [props.palette, props.layout, props.aspect, props.safeBox, props.presentation],
  );
  const landscape = props.aspect === '16:9' ? props.presentation : undefined;
  const floating = !!landscape || props.layout === 'over';
  return (
    <ExplainerProvider value={ctx}>
      <AbsoluteFill
        style={{
          backgroundColor: floating ? 'transparent' : props.palette.bgOuter,
          clipPath: landscape ? longformClipPath(landscape) : undefined,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <ExplainerFonts />
        <StageBackground />
        <StageContent {...props} />
      </AbsoluteFill>
    </ExplainerProvider>
  );
};
