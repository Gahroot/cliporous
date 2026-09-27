import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

import {
  buildClipLayoutWindows,
  buildClipLevelWords,
  mapCuesToClipTime,
  type ResolvedSegment,
} from './segment-render';

function seg(
  startTime: number,
  endTime: number,
  extra: Partial<ResolvedSegment> = {},
): ResolvedSegment {
  return {
    startTime,
    endTime,
    archetype: 'talking-head',
    zoom: { style: 'none', intensity: 1 },
    transitionIn: 'hard-cut',
    ...extra,
  };
}

describe('buildClipLevelWords', () => {
  it('captions a word that straddles a segment cut exactly once', () => {
    const words = [
      { text: 'more', start: 4.5, end: 4.8 },
      { text: 'revenue', start: 4.9, end: 5.3 },
      { text: 'this', start: 5.4, end: 5.6 },
    ];
    const out = buildClipLevelWords([seg(0, 5), seg(5, 10)], words, undefined, [0, 0]);
    expect(out.map((w) => w.text)).toEqual(['more', 'revenue', 'this']);
    // "revenue" midpoint (5.1) is in segment 2.
    expect(out[1]?.start).toBeCloseTo(5);
  });

  it('keeps the same rule when emphasis data is supplied', () => {
    const words = [{ text: 'revenue', start: 4.9, end: 5.3 }];
    const out = buildClipLevelWords(
      [seg(0, 5), seg(5, 10)],
      words,
      [{ text: 'revenue', start: 4.9, end: 5.3, emphasis: 'emphasis' }],
      [0, 0],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.emphasis).toBe('emphasis');
  });
});

describe('explainer clip-time helpers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-words-'));
  const stage = join(dir, 'stage.mp4');
  writeFileSync(stage, '');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const segments = [
    seg(10, 14),
    seg(14, 20, { archetype: 'split-image', explainerLayout: 'pip', videoPath: stage }),
    seg(20, 25),
  ];

  it('builds caption layout windows only for rendered explainer segments', () => {
    expect(buildClipLayoutWindows(segments, [0, 0, 0])).toEqual([
      { startTime: 4, endTime: 10, layout: 'pip' },
    ]);
  });

  it('maps source-time cues onto the concatenated clip timeline', () => {
    const cues = mapCuesToClipTime(
      [
        { kind: 'tick', at: 15 },
        { kind: 'thump', at: 30 },
        { kind: 'slide', at: 21 },
      ],
      segments,
      [0, 0, 0.5],
    );
    expect(cues).toEqual([
      { kind: 'tick', at: 5 },
      { kind: 'slide', at: 10.5 },
    ]);
  });
});
