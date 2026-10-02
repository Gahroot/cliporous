import { describe, expect, it } from 'vitest';
import { BUILTIN_PALETTES } from '../../shared/palettes';
import type { StoryBoardSpec } from '../remotion/compositions/storyboard/types';
import type { LongformSceneSegment } from './longform-scene-timeline';
import { buildLongformStoryboardProps, mapStoryboardTimes } from './longform-storyboard-props';

function board(): StoryBoardSpec {
  return {
    durationSec: 8,
    boardIn: { at: 2.013, dur: 0.3 },
    boardOut: { at: 9.61, dur: 0.39 },
    shots: [
      { at: 2.013, dur: 0, x: 700, y: 400, zoom: 1 },
      { at: 5, dur: 0.8, x: 2000, y: 400, zoom: 0.9, driftX: 4 },
    ],
    worldBounds: { x: 0, y: 0, width: 3000, height: 1000 },
    panels: [
      {
        id: 'p',
        kind: 'statement',
        title: 'Source',
        at: 2.013,
        x: 0,
        y: 0,
        width: 1400,
        height: 800,
      },
    ],
    elements: [
      {
        id: 'frame',
        kind: 'frame',
        at: 2.2,
        x: 0,
        y: 0,
        w: 400,
        h: 300,
        rows: 2,
        rowsAt: 2.8,
        title: [{ text: 'Source', at: 2.3 }],
      },
      {
        id: 'text',
        kind: 'text',
        at: 2.4,
        x: 100,
        y: 100,
        text: 'Source',
        size: 44,
        tone: 'ink',
        width: 300,
        highlightAt: 3,
      },
      { id: 'curve', kind: 'curve', at: 3, x: 0, y: 0, w: 100, h: 100, dotAt: 3.1 },
      { id: 'tracks', kind: 'tracks', at: 3, x: 0, y: 0, w: 100, h: 100, playAt: 3.2 },
      {
        id: 'note',
        kind: 'note',
        at: 3.3,
        x: 0,
        y: 0,
        rot: 0.01,
        title: 'Source',
        width: 200,
        height: 200,
      },
      {
        id: 'counter',
        kind: 'counter',
        at: 3.4,
        x: 100,
        y: 100,
        value: 12,
        unit: 'items',
        size: 64,
        width: 300,
      },
    ],
    props: [
      {
        id: 'book',
        semanticId: 'book',
        model: 'book',
        at: 2.5,
        x: 200,
        y: 200,
        size: 240,
        action: 'activate',
        actionEndAt: 4,
        glowAt: 3,
        shakeAt: 3.1,
        flight: { from: { x: 0, y: 0 }, via: { x: 100, y: 100 }, dur: 0.8 },
      },
    ],
  };
}
const timeKeys = new Set([
  'at',
  'rowsAt',
  'highlightAt',
  'dotAt',
  'playAt',
  'glowAt',
  'shakeAt',
  'actionEndAt',
]);
function assertMapped(before: unknown, after: unknown): void {
  if (Array.isArray(before)) {
    expect(Array.isArray(after)).toBe(true);
    before.forEach((entry, index) => {
      assertMapped(entry, (after as unknown[])[index]);
    });
  } else if (before && typeof before === 'object') {
    const a = after as Record<string, unknown>;
    for (const [key, value] of Object.entries(before)) {
      if (timeKeys.has(key)) expect(a[key]).toBeCloseTo(Number(value) - 2, 9);
      else assertMapped(value, a[key]);
    }
  } else expect(after).toEqual(before);
}
describe('storyboard source-time mapping', () => {
  it('rebases every camera, fade, title, label, note, quantity, prop and panel beat once', () => {
    const original = board();
    const copy = structuredClone(original);
    const local = mapStoryboardTimes(original, (time) => time - 2);
    assertMapped(original, local);
    expect(original).toEqual(copy);
    expect(local.props[0].flight?.dur).toBe(0.8);
  });
  it('uses the outward-rounded segment start and frame count, without inward beat clamping', () => {
    const spec = board();
    const segment: Extract<LongformSceneSegment, { kind: 'scene' }> = {
      kind: 'scene',
      startFrame: 60,
      endFrame: 301,
      startTime: 2,
      endTime: 301 / 30,
      compiled: {
        kind: 'storyboard',
        board: spec,
        cues: [],
        placement: {
          id: 'b',
          kind: 'storyboard',
          sourceSpec: {},
          startWord: 0,
          endWord: 10,
          startTime: 2.013,
          endTime: 10.013,
          sectionId: 's',
          presentation: 'full-frame',
          label: 'Source',
          purpose: '',
        },
      },
    };
    const props = buildLongformStoryboardProps(segment, 'ink', BUILTIN_PALETTES[0]);
    expect(props.spec.boardIn.at).toBeCloseTo(0.013, 9);
    expect(props.spec.durationSec).toBe(241 / 30);
    expect(props.spec.boardOut.at).toBeCloseTo(7.61, 9);
    expect(props.spec.boardOut.dur).toBe(0.39);
    expect(props.style).toBe('ink');
    expect(props.palette).toEqual(BUILTIN_PALETTES[0]);
    expect(props.palette).not.toBe(BUILTIN_PALETTES[0]);
  });
});
