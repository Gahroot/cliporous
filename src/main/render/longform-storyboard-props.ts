import type { Palette } from '@shared/palettes';
import type { StoryboardStyle } from '@shared/storyboards';
import { LANDSCAPE_FPS } from '../aspect-ratios';
import type {
  ProductionStoryBoardProps,
  StoryBoardSpec,
} from '../remotion/compositions/storyboard/types';
import type { LongformSceneSegment } from './longform-scene-timeline';

/** Exhaustive absolute-source -> segment-local mapping. Durations and geometry never move. */
export function mapStoryboardTimes(
  spec: StoryBoardSpec,
  map: (time: number) => number,
): StoryBoardSpec {
  return {
    ...spec,
    boardIn: { ...spec.boardIn, at: map(spec.boardIn.at) },
    boardOut: { ...spec.boardOut, at: map(spec.boardOut.at) },
    shots: spec.shots.map((shot) => ({ ...shot, at: map(shot.at) })),
    elements: spec.elements.map((element) => {
      switch (element.kind) {
        case 'text':
          return {
            ...element,
            at: map(element.at),
            ...(element.highlightAt !== undefined ? { highlightAt: map(element.highlightAt) } : {}),
          };
        case 'frame':
          return {
            ...element,
            at: map(element.at),
            ...(element.rowsAt !== undefined ? { rowsAt: map(element.rowsAt) } : {}),
            ...(element.title
              ? { title: element.title.map((title) => ({ ...title, at: map(title.at) })) }
              : {}),
          };
        case 'curve':
          return {
            ...element,
            at: map(element.at),
            ...(element.dotAt !== undefined ? { dotAt: map(element.dotAt) } : {}),
          };
        case 'tracks':
          return { ...element, at: map(element.at), playAt: map(element.playAt) };
        default:
          return { ...element, at: map(element.at) };
      }
    }),
    props: spec.props.map((prop) => ({
      ...prop,
      at: map(prop.at),
      ...(prop.glowAt !== undefined ? { glowAt: map(prop.glowAt) } : {}),
      ...(prop.shakeAt !== undefined ? { shakeAt: map(prop.shakeAt) } : {}),
      ...(prop.actionEndAt !== undefined ? { actionEndAt: map(prop.actionEndAt) } : {}),
    })),
    ...(spec.panels
      ? { panels: spec.panels.map((panel) => ({ ...panel, at: map(panel.at) })) }
      : {}),
  };
}

export function buildLongformStoryboardProps(
  segment: Extract<LongformSceneSegment, { kind: 'scene' }>,
  style: StoryboardStyle,
  palette: Palette,
): ProductionStoryBoardProps {
  if (segment.compiled.kind !== 'storyboard') throw new Error('Expected a compiled storyboard.');
  const spec = mapStoryboardTimes(segment.compiled.board, (time) => time - segment.startTime);
  return {
    spec: { ...spec, durationSec: (segment.endFrame - segment.startFrame) / LANDSCAPE_FPS },
    style,
    palette: { ...palette },
  };
}
