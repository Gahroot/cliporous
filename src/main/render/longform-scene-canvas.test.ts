import { describe, expect, it } from 'vitest';
import type { LongformScenePlacement, SceneFirstLongformPlan } from '../../shared/longform-scenes';
import type { CompiledLongformScene } from '../ai/longform-scene-contract';
import {
  buildCanvasLayout,
  canvasCameraAt,
  canvasOpacity,
  focusPose,
  overviewPose,
  panelInView,
  placePanels,
} from '../remotion/compositions/scene-canvas/geometry';
import { SCENE_CANVAS_LIMITS } from '../remotion/compositions/scene-canvas/types';
import { cameraAt } from '../remotion/compositions/storyboard/camera';
import {
  buildSceneCanvasPanels,
  type CanvasTimelineEntry,
  groupSceneCanvases,
  sceneCanvasEnabled,
} from './longform-scene-canvas';
import { buildLongformSceneTimeline } from './longform-scene-timeline';

interface Spec {
  id: string;
  start: number;
  end: number;
  kind?: string;
  section?: string;
}

function build(specs: Spec[], sourceDuration = 200) {
  const scenes: LongformScenePlacement[] = specs.map((s) => ({
    id: s.id,
    startTime: s.start,
    endTime: s.end,
    kind: (s.kind ?? 'checklist') as LongformScenePlacement['kind'],
    startWord: 0,
    endWord: 1,
    sectionId: s.section ?? 'section-a',
    presentation: 'speaker-side',
    sourceSpec: {},
    label: s.id,
    purpose: 'Explain',
  }));
  const plan: SceneFirstLongformPlan = {
    mode: 'scene-first',
    schemaVersion: 2,
    parserVersion: 1,
    sourceFingerprint: 'unused',
    sourceDuration,
    blocks: [],
    phrases: [],
    sections: [],
    scenes,
    reasoning: '',
    generatedAt: 0,
  };
  const compiled = scenes.map(
    (scene) =>
      ({
        kind: 'explainer',
        placement: scene,
        planned: {
          startTime: scene.startTime,
          endTime: scene.endTime,
          scene: {
            kind: scene.kind,
            words: [{ text: 'Source', at: scene.startTime + 0.5 }],
          },
          layout: 'takeover',
          chained: false,
          transition: 'fade',
          cues: [],
        },
      }) as unknown as CompiledLongformScene,
  );
  return buildLongformSceneTimeline(plan, compiled);
}

function shape(entries: CanvasTimelineEntry[]): string[] {
  return entries.map((e) =>
    e.kind === 'canvas'
      ? `canvas(${e.group.members.map((m) => m.compiled.placement.id).join(',')})`
      : e.segment.kind === 'scene'
        ? `scene(${e.segment.compiled.placement.id})`
        : 'speaker',
  );
}

function frames(entries: CanvasTimelineEntry[]): Array<[number, number]> {
  return entries.map((e) =>
    e.kind === 'canvas'
      ? [e.group.startFrame, e.group.endFrame]
      : [e.segment.startFrame, e.segment.endFrame],
  );
}

describe('groupSceneCanvases', () => {
  const cases: Array<{ name: string; specs: Spec[]; expected: string[] }> = [
    {
      name: 'groups close scenes in one section',
      specs: [
        { id: 'a', start: 10, end: 16 },
        { id: 'b', start: 20, end: 26 },
        { id: 'c', start: 30, end: 36 },
      ],
      expected: ['speaker', 'canvas(a,b,c)', 'speaker'],
    },
    {
      name: 'a single scene stays an ordinary cut',
      specs: [{ id: 'a', start: 10, end: 16 }],
      expected: ['speaker', 'scene(a)', 'speaker'],
    },
    {
      name: 'a long speaker gap splits the run',
      specs: [
        { id: 'a', start: 10, end: 16 },
        { id: 'b', start: 16 + SCENE_CANVAS_LIMITS.maxGapSec + 1, end: 50 },
      ],
      expected: ['speaker', 'scene(a)', 'speaker', 'scene(b)', 'speaker'],
    },
    {
      name: 'never crosses a planning section',
      specs: [
        { id: 'a', start: 10, end: 16 },
        { id: 'b', start: 18, end: 24, section: 'section-b' },
      ],
      expected: ['speaker', 'scene(a)', 'speaker', 'scene(b)', 'speaker'],
    },
    {
      name: 'protected full-window kinds break the run',
      specs: [
        { id: 'a', start: 10, end: 16 },
        { id: 'b', start: 18, end: 24, kind: 'bottleneck' },
        { id: 'c', start: 26, end: 32 },
        { id: 'd', start: 34, end: 40 },
      ],
      expected: ['speaker', 'scene(a)', 'speaker', 'scene(b)', 'speaker', 'canvas(c,d)', 'speaker'],
    },
    {
      name: 'caps WebGL panels per canvas',
      specs: [
        { id: 'a', start: 10, end: 16, kind: 'stairs' },
        { id: 'b', start: 18, end: 24, kind: 'funnel' },
        { id: 'c', start: 26, end: 32, kind: 'podium' },
        { id: 'd', start: 34, end: 40, kind: 'iceberg' },
      ],
      expected: ['speaker', 'canvas(a,b)', 'speaker', 'canvas(c,d)', 'speaker'],
    },
    {
      name: 'caps panels per canvas',
      specs: Array.from({ length: 7 }, (_, i) => ({
        id: `p${i}`,
        start: 10 + i * 8,
        end: 16 + i * 8,
      })),
      expected: ['speaker', 'canvas(p0,p1,p2,p3,p4)', 'speaker', 'canvas(p5,p6)', 'speaker'],
    },
    {
      name: 'caps the canvas span',
      specs: [
        { id: 'a', start: 10, end: 30 },
        { id: 'b', start: 45, end: 65 },
        { id: 'c', start: 82, end: 102 },
      ],
      expected: ['speaker', 'canvas(a,b)', 'speaker', 'scene(c)', 'speaker'],
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const timeline = build(c.specs);
      const entries = groupSceneCanvases(timeline.segments, timeline.totalFrames);
      expect(shape(entries)).toEqual(c.expected);
    });
  }

  it('preserves every frame: contiguous, gap-free and the same total length', () => {
    const timeline = build([
      { id: 'a', start: 10.013, end: 16.2 },
      { id: 'b', start: 20.07, end: 26.4 },
      { id: 'c', start: 60, end: 64 },
    ]);
    const entries = groupSceneCanvases(timeline.segments, timeline.totalFrames);
    const spans = frames(entries);
    expect(spans[0]?.[0]).toBe(0);
    for (let i = 1; i < spans.length; i++) expect(spans[i]?.[0]).toBe(spans[i - 1]?.[1]);
    expect(spans[spans.length - 1]?.[1]).toBe(timeline.totalFrames);
  });

  it('borrows a short closing tail only from a long enough speaker window', () => {
    const long = build([
      { id: 'a', start: 10, end: 16 },
      { id: 'b', start: 18, end: 24 },
    ]);
    const withTail = groupSceneCanvases(long.segments, long.totalFrames);
    const canvas = withTail.find((e) => e.kind === 'canvas');
    expect(canvas?.kind === 'canvas' && canvas.group.endFrame).toBe(24 * 30 + 45);

    const short = build(
      [
        { id: 'a', start: 10, end: 16 },
        { id: 'b', start: 18, end: 24 },
      ],
      26,
    );
    const noTail = groupSceneCanvases(short.segments, short.totalFrames);
    const group = noTail.find((e) => e.kind === 'canvas');
    expect(group?.kind === 'canvas' && group.group.endFrame).toBe(24 * 30);
  });

  it('rebases panel scenes and times to canvas-local seconds', () => {
    const timeline = build([
      { id: 'a', start: 10, end: 16 },
      { id: 'b', start: 20, end: 26 },
    ]);
    const entry = groupSceneCanvases(timeline.segments, timeline.totalFrames).find(
      (e) => e.kind === 'canvas',
    );
    if (entry?.kind !== 'canvas') throw new Error('expected a canvas');
    const panels = buildSceneCanvasPanels(entry.group);
    expect(panels.map((p) => [p.id, p.startSec, p.endSec])).toEqual([
      ['a', 0, 6],
      ['b', 10, 16],
    ]);
    expect(panels[1]?.scene).toMatchObject({ words: [{ at: 0.5 }] });
  });

  it('defaults on for plans saved before the setting existed', () => {
    expect(sceneCanvasEnabled({})).toBe(true);
    expect(sceneCanvasEnabled({ sceneCanvas: true })).toBe(true);
    expect(sceneCanvasEnabled({ sceneCanvas: false })).toBe(false);
  });
});

describe('scene canvas geometry', () => {
  const panels = [
    { id: 'a', startSec: 0, endSec: 6, scene: { kind: 'statement', words: [] } },
    { id: 'b', startSec: 7, endSec: 13, scene: { kind: 'statement', words: [] } },
    { id: 'c', startSec: 22, endSec: 28, scene: { kind: 'statement', words: [] } },
  ] as const;
  const layout = buildCanvasLayout(
    panels.map((p) => ({ ...p, scene: { kind: 'statement' as const, words: [] } })),
    30,
  );

  it('places panels left to right without overlap and is deterministic', () => {
    const boxes = placePanels(panels);
    for (let i = 1; i < boxes.length; i++) {
      const prev = boxes[i - 1];
      const cur = boxes[i];
      if (!prev || !cur) throw new Error('missing box');
      expect(cur.x).toBeGreaterThan(prev.x + prev.width);
    }
    expect(placePanels(panels)).toEqual(boxes);
  });

  it('is framed on each panel for its whole spoken window', () => {
    for (const [i, panel] of panels.entries()) {
      const box = layout.panels[i];
      if (!box) throw new Error('missing box');
      const focus = focusPose(box);
      for (const t of [
        panel.startSec + 0.01,
        (panel.startSec + panel.endSec) / 2,
        panel.endSec - 0.31,
      ]) {
        const pose = cameraAt(layout.shots, t);
        expect(pose.x).toBeCloseTo(focus.x, 3);
        expect(pose.y).toBeCloseTo(focus.y, 3);
        expect(pose.zoom).toBeCloseTo(focus.zoom, 5);
      }
    }
  });

  it('pulls back to the accumulated story on long gaps and at the end', () => {
    const mid = cameraAt(layout.shots, 17);
    const before = overviewPose(layout.panels.slice(0, 2));
    expect(mid.zoom).toBeCloseTo(before.zoom, 5);
    const end = cameraAt(layout.shots, 30);
    expect(end.zoom).toBeCloseTo(overviewPose(layout.panels).zoom, 5);
  });

  it('keeps the camera continuous on screen (fast whips, never a cut)', () => {
    let prev = canvasCameraAt(layout, 0, 'seed');
    let moving = 0;
    for (let f = 1; f <= 30 * 30; f++) {
      const pose = canvasCameraAt(layout, f / 30, 'seed');
      const screen = Math.hypot(pose.x - prev.x, pose.y - prev.y) * pose.zoom;
      expect(screen).toBeLessThan(1920 / 5);
      if (screen > 1e-4) moving++;
      prev = pose;
    }
    // Handheld drift: a resting board is never frozen.
    expect(moving).toBe(30 * 30);
  });

  it('fades the board in and out over the source', () => {
    expect(canvasOpacity(layout, 0)).toBe(0);
    expect(canvasOpacity(layout, 5)).toBe(1);
    expect(canvasOpacity(layout, 30)).toBe(0);
  });

  it('mounts only panels near the viewport', () => {
    const [a, , c] = layout.panels;
    if (!a || !c) throw new Error('missing box');
    const pose = focusPose(a);
    expect(panelInView(a, pose)).toBe(true);
    expect(panelInView(c, pose)).toBe(false);
  });

  it('rejects overlapping or out-of-range panels', () => {
    expect(() =>
      buildCanvasLayout(
        [
          { id: 'a', startSec: 0, endSec: 6, scene: { kind: 'statement', words: [] } },
          { id: 'b', startSec: 5, endSec: 9, scene: { kind: 'statement', words: [] } },
        ],
        10,
      ),
    ).toThrow(/invalid timing/);
  });
});
