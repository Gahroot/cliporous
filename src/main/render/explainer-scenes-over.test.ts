import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannedExplainerScene } from '../ai/explainer-scenes';
import { deriveExplainerPalette } from '../remotion/compositions/explainer/palette';
import type {
  ExplainerScene,
  ExplainerSequenceProps,
} from '../remotion/compositions/explainer/types';
import type { FaceMeasurement } from './over-placement';
import type { ResolvedSegment } from './segment-render';

const planMock = vi.hoisted(() => vi.fn());
const renderMock = vi.hoisted(() => vi.fn());

vi.mock('../ai/explainer-scenes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/explainer-scenes')>()),
  planExplainerEditPlan: planMock,
}));
vi.mock('../remotion/render', () => ({ renderRemotionSegment: renderMock }));

const { applyExplainerScenes } = await import('./explainer-scenes');

const STAMP: ExplainerScene = { kind: 'stamp', icon: 'Ban', word: 'STOP', stampAt: 18 };

const overScene: PlannedExplainerScene = {
  startTime: 16,
  endTime: 22,
  scene: STAMP,
  layout: 'over',
  chained: false,
  transition: 'grow',
  cues: [],
};

const segments: ResolvedSegment[] = [
  {
    startTime: 0,
    endTime: 28,
    archetype: 'talking-head',
    zoom: { style: 'drift', intensity: 1.1 },
    transitionIn: 'crossfade',
  },
];

const framing = { sourceWidth: 640, sourceHeight: 360, width: 1080, height: 1920 };

async function run(face: FaceMeasurement | 'throws' | 'absent') {
  const measureFaces =
    face === 'absent'
      ? undefined
      : vi.fn(async () => {
          if (face === 'throws') throw new Error('sidecar down');
          return [face];
        });
  const result = await applyExplainerScenes({
    apiKey: 'k',
    segments,
    words: [{ text: 'stop', start: 16, end: 16.4 }],
    bounds: { minStart: 3, maxEnd: 28 },
    palette: deriveExplainerPalette(),
    ...(measureFaces ? { measureFaces, framing } : {}),
  });
  const call = renderMock.mock.calls[0]?.[0] as
    | { inputProps: ExplainerSequenceProps; height: number; transparent: boolean }
    | undefined;
  const scenePiece = result.segments.find((s) => s.archetype === 'split-image');
  return { result, call, scenePiece, measureFaces };
}

describe('applyExplainerScenes — floating cards and the face', () => {
  beforeEach(() => {
    planMock.mockReset().mockResolvedValue({
      ok: true,
      value: { scenes: [overScene], quotes: [], diagnostics: { events: [], dropped: 0 } },
    });
    renderMock.mockReset().mockResolvedValue(undefined);
  });

  it('switches a close-up to the split screen instead of covering the face', async () => {
    // Real measurement from a 640×360 close-up (face rows 57–162).
    const { call, scenePiece, measureFaces } = await run({ top: 57, bottom: 162 });
    expect(measureFaces).toHaveBeenCalledWith([{ start: 16, end: 22 }]);
    expect(scenePiece?.explainerLayout).toBe('stack');
    expect(call?.inputProps.layout).toBe('stack');
    expect(call?.transparent).toBe(false);
    expect(call?.height).toBe(960);
  });

  it('moves the card below a face high in the frame', async () => {
    // Rows 20–60 of 360 → canvas ~107–320 before padding.
    const { call, scenePiece } = await run({ top: 20, bottom: 60 });
    expect(scenePiece?.explainerLayout).toBe('over');
    expect(call?.inputProps.layout).toBe('over');
    const safe = call?.inputProps.safeBox;
    expect(safe).toBeDefined();
    expect(safe?.y).toBeGreaterThanOrEqual(320);
  });

  it('keeps the default card when no face is in shot', async () => {
    const { call, scenePiece } = await run(null);
    expect(scenePiece?.explainerLayout).toBe('over');
    expect(call?.inputProps.safeBox).toBeUndefined();
  });

  it.each([
    'throws',
    'absent',
  ] as const)('uses the split screen when the face check is %s', async (face) => {
    const { call, scenePiece } = await run(face);
    expect(scenePiece?.explainerLayout).toBe('stack');
    expect(call?.inputProps.layout).toBe('stack');
  });
});
