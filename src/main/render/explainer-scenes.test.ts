import type { Archetype } from '@shared/types';
import { describe, expect, it } from 'vitest';
import type { PlannedExplainerScene } from '../ai/explainer-scenes';
import type { ExplainerScene } from '../remotion/compositions/explainer/types';
import { spliceExplainerScenes } from './explainer-scenes';
import type { ResolvedSegment } from './segment-render';

function seg(
  archetype: Archetype,
  startTime: number,
  endTime: number,
  extra: Partial<ResolvedSegment> = {},
): ResolvedSegment {
  return {
    startTime,
    endTime,
    archetype,
    zoom: { style: 'drift', intensity: 1.1 },
    transitionIn: 'crossfade',
    ...extra,
  };
}

const STAMP: ExplainerScene = { kind: 'stamp', icon: 'Ban', word: 'NEVER', stampAt: 14 };

function planned(startTime: number, endTime: number, scene = STAMP): PlannedExplainerScene {
  return { startTime, endTime, scene };
}

function shape(pieces: ReturnType<typeof spliceExplainerScenes>): string[] {
  return pieces.map(
    (p) =>
      `${p.scene ? 'SCENE' : p.segment.archetype} ${p.segment.startTime}-${p.segment.endTime} ${p.segment.transitionIn}`,
  );
}

describe('spliceExplainerScenes', () => {
  it('cuts a scene out of the middle of one segment and hard-cuts back', () => {
    const out = spliceExplainerScenes([seg('talking-head', 10, 30)], [planned(14, 20)], 12);
    expect(shape(out)).toEqual([
      'talking-head 10-14 crossfade',
      'SCENE 14-20 hard-cut',
      'talking-head 20-30 hard-cut',
    ]);
    const scene = out[1];
    expect(scene?.segment.archetype).toBe('split-image');
    expect(scene?.segment.zoom).toEqual({ style: 'none', intensity: 1 });
  });

  it('spans segment boundaries, replaces b-roll, and snaps edges to nearby boundaries', () => {
    const out = spliceExplainerScenes(
      [
        seg('talking-head', 10, 14.3),
        seg('split-image', 14.3, 18, { videoPath: '/tmp/broll.mp4' }),
        seg('tight-punch', 18, 25),
      ],
      [planned(14, 21.6)],
      12,
    );
    expect(shape(out)).toEqual([
      'talking-head 10-14.3 crossfade',
      'SCENE 14.3-21.6 hard-cut',
      'tight-punch 21.6-25 hard-cut',
    ]);
    expect(out[1]?.segment.videoPath).toBeUndefined();
  });

  it('never snaps a scene start before the protected opening', () => {
    const out = spliceExplainerScenes(
      [seg('talking-head', 10, 12.2), seg('talking-head', 12.2, 30)],
      [planned(12.5, 18)],
      12.5,
    );
    // The 12.2 boundary is closer, but snapping to it would eat the protected
    // opening; the scene stays at 12.5 and a short speaker piece fills the gap.
    expect(shape(out)).toEqual([
      'talking-head 10-12.2 crossfade',
      'talking-head 12.2-12.5 crossfade',
      'SCENE 12.5-18 hard-cut',
      'talking-head 18-30 hard-cut',
    ]);
  });

  it('drops windows that cross a gap in the source timeline or overlap', () => {
    const segments = [seg('talking-head', 10, 16), seg('talking-head', 40, 50)];
    expect(shape(spliceExplainerScenes(segments, [planned(13, 42.5)], 12))).toEqual([
      'talking-head 10-16 crossfade',
      'talking-head 40-50 crossfade',
    ]);

    const overlapping = spliceExplainerScenes(
      [seg('talking-head', 10, 40)],
      [planned(14, 20), planned(19, 25), planned(27, 31)],
      12,
    );
    expect(overlapping.filter((p) => p.scene).map((p) => p.segment.startTime)).toEqual([14, 27]);
  });

  it('returns the input unchanged when nothing is planned', () => {
    const segments = [seg('talking-head', 10, 20)];
    expect(spliceExplainerScenes(segments, [], 12).map((p) => p.segment)).toEqual(segments);
  });
});
