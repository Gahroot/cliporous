/**
 * Transitions between chained explainer scenes (TransitionSeries
 * presentations). Pattern adapted from Remocn's `spatialPush` (MIT):
 * a presentation component receives `presentationProgress` (0→1) and whether
 * it wraps the entering or exiting scene.
 *
 *  - `grow`  — the old scene scales up toward the viewer and dissolves while
 *              the new one settles in from slightly small: reads as the focus
 *              item "growing into" the next scene (one continuous story).
 *  - `slide` — spatial push to the left with a little depth + blur.
 *  - `fade`  — soft crossfade.
 */

import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { linearTiming, springTiming, type TransitionTiming } from '@remotion/transitions';
import type React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type { SceneTransitionKind } from './types';

type Props = { kind: SceneTransitionKind };

const ScenePresentation: React.FC<TransitionPresentationComponentProps<Props>> = ({
  children,
  presentationProgress: p,
  presentationDirection,
  passedProps,
}) => {
  const exiting = presentationDirection === 'exiting';
  let style: React.CSSProperties;
  switch (passedProps.kind) {
    case 'grow': {
      const blur = exiting ? interpolate(p, [0, 1], [0, 14]) : interpolate(p, [0, 1], [10, 0]);
      style = exiting
        ? {
            transform: `scale(${interpolate(p, [0, 1], [1, 1.35])})`,
            opacity: interpolate(p, [0, 0.75, 1], [1, 0.25, 0]),
            filter: `blur(${blur}px)`,
          }
        : {
            transform: `scale(${interpolate(p, [0, 1], [0.86, 1])})`,
            opacity: interpolate(p, [0, 0.35, 1], [0, 0.6, 1]),
            filter: `blur(${blur}px)`,
          };
      break;
    }
    case 'slide': {
      const blur = interpolate(p, [0, 0.5, 1], [0, 5, 0]);
      style = exiting
        ? {
            transform: `translateX(${-p * 60}%) scale(${interpolate(p, [0, 1], [1, 0.92])})`,
            opacity: interpolate(p, [0, 1], [1, 0.2]),
            filter: `blur(${blur}px)`,
          }
        : {
            transform: `translateX(${(1 - p) * 70}%)`,
            filter: `blur(${blur}px)`,
          };
      break;
    }
    case 'fade':
      style = { opacity: exiting ? 1 - p : p };
      break;
  }
  return (
    <AbsoluteFill style={{ ...style, willChange: 'transform, filter' }}>{children}</AbsoluteFill>
  );
};

export function scenePresentation(kind: SceneTransitionKind): TransitionPresentation<Props> {
  return { component: ScenePresentation, props: { kind } };
}

export function sceneTiming(kind: SceneTransitionKind, durationInFrames: number): TransitionTiming {
  return kind === 'fade'
    ? linearTiming({ durationInFrames })
    : springTiming({ durationInFrames, config: { damping: 200 } });
}
