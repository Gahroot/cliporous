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
import {
  idleTransform,
  NO_IDLE,
  PANEL_IDLE,
  panelIdleAt,
  panelSettleSec,
} from '../remotion/compositions/scene-canvas/idle';
import { SCENE_CANVAS_LIMITS } from '../remotion/compositions/scene-canvas/types';
import { cameraAt } from '../remotion/compositions/storyboard/camera';
import {
  buildSceneCanvasNotes,
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
        // Framed on the panel, allowing the slow push-in that keeps a rest alive.
        expect(Math.abs(pose.x - focus.x)).toBeLessThan(50);
        expect(pose.y).toBeCloseTo(focus.y, 3);
        expect(pose.zoom).toBeGreaterThanOrEqual(focus.zoom - 1e-9);
        expect(pose.zoom).toBeLessThanOrEqual(focus.zoom * 1.11);
      }
    }
  });

  it('pulls back to the accumulated story on long gaps and at the end', () => {
    const settled = cameraAt(layout.shots, 14.6);
    const before = overviewPose(layout.panels.slice(0, 2));
    expect(settled.zoom / before.zoom).toBeGreaterThan(0.999);
    expect(settled.zoom / before.zoom).toBeLessThan(1.05);
    const end = cameraAt(layout.shots, 30);
    expect(end.zoom).toBeCloseTo(overviewPose(layout.panels).zoom, 5);
  });

  it('pushes in slowly during a long rest instead of holding still', () => {
    const early = cameraAt(layout.shots, 0.5);
    const late = cameraAt(layout.shots, 5.5);
    expect(late.zoom / early.zoom).toBeGreaterThan(1.05);
  });

  it('re-frames on each spaced-out beat, alternating sides and tightening', () => {
    const beats = buildCanvasLayout(
      [
        {
          id: 'a',
          startSec: 0,
          endSec: 12,
          scene: {
            kind: 'statement',
            words: [
              { text: 'One', at: 2 },
              { text: 'Two', at: 5 },
              { text: 'Three', at: 8 },
            ],
          },
        },
      ],
      12,
    );
    const a = beats.panels[0];
    if (!a) throw new Error('missing box');
    const focus = focusPose(a);
    const after = [2, 5, 8].map((beat) => cameraAt(beats.shots, beat + 1));
    const sides = after.map((p) => Math.sign(p.x - focus.x));
    expect(sides[0]).not.toBe(0);
    expect(sides[1]).toBe(-(sides[0] ?? 0));
    expect(sides[2]).toBe(sides[0]);
    for (let i = 1; i < after.length; i++)
      expect(after[i]?.zoom ?? 0).toBeGreaterThan(after[i - 1]?.zoom ?? 0);
    // Every move stays inside the panel's own window.
    expect(cameraAt(beats.shots, 11.9).zoom).toBeLessThanOrEqual(focus.zoom * 1.11);
  });

  it('hands long talking gaps back to the speaker, then returns to the board', () => {
    expect(layout.breaks).toHaveLength(1);
    expect(canvasOpacity(layout, 14.9)).toBe(1);
    expect(canvasOpacity(layout, 18)).toBe(0);
    expect(canvasOpacity(layout, 21.5)).toBe(1);
  });

  it('hands a finished board back to the speaker and opens on it late', () => {
    // Like the real stairs scene: two quick beats, then the speaker keeps talking.
    const board = buildCanvasLayout(
      [
        {
          id: 'a',
          startSec: 0,
          endSec: 8.7,
          scene: {
            kind: 'statement',
            words: [
              { text: 'Beginner', at: 2 },
              { text: 'Pro', at: 3.7 },
            ],
          },
        },
        {
          id: 'b',
          startSec: 15,
          endSec: 21,
          scene: { kind: 'statement', words: [{ text: 'Next', at: 1 }] },
        },
      ],
      25,
    );
    // Speaker until just before the first drawing.
    expect(canvasOpacity(board, 0.5)).toBe(0);
    expect(canvasOpacity(board, 1.6)).toBe(1);
    // Done at 3.7 + 2.2 s: overview, then the speaker instead of a static board.
    expect(canvasOpacity(board, 7)).toBe(1);
    expect(canvasOpacity(board, 10)).toBe(0);
    expect(canvasOpacity(board, 15.5)).toBe(1);
    // The last panel is done at 18.2 s: close on the story, then stay on the speaker.
    expect(canvasOpacity(board, 19.5)).toBe(1);
    expect(canvasOpacity(board, 21.5)).toBe(0);
  });

  it('waits on the previous panel instead of arriving at an empty frame', () => {
    const late = buildCanvasLayout(
      [
        { id: 'a', startSec: 0, endSec: 6, scene: { kind: 'statement', words: [] } },
        {
          id: 'b',
          startSec: 6.5,
          endSec: 14,
          scene: { kind: 'statement', words: [{ text: 'Late', at: 3 }] },
        },
      ],
      14,
    );
    const b = late.panels[1];
    if (!b) throw new Error('missing box');
    // First drawing at 6.5 + 3 s: arrive about half a second before it, not at 6.15.
    expect(Math.abs(cameraAt(late.shots, 7.5).x - focusPose(b).x)).toBeGreaterThan(100);
    expect(Math.abs(cameraAt(late.shots, 9.2).x - focusPose(b).x)).toBeLessThan(40);
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

describe('scene canvas board notes', () => {
  const group = {
    startFrame: 300,
    endFrame: 900,
    startTime: 10,
    endTime: 30,
    members: [],
  };

  it('turns phrases spoken inside the canvas into canvas-local notes', () => {
    const phrases = [
      { text: 'SUCH A NOISY PHRASE', startTime: 14, endTime: 15.5 },
      { text: 'Before the canvas', startTime: 8, endTime: 9 },
      { text: 'Runs past the end', startTime: 29, endTime: 31 },
      { text: 'iPhone users', startTime: 12, endTime: 13 },
    ];
    const { notes, absorbed } = buildSceneCanvasNotes(group, phrases);
    expect(notes).toEqual([
      { id: 'note-0', text: 'iPhone users', startSec: 2, endSec: 3 },
      { id: 'note-1', text: 'Such a noisy phrase', startSec: 4, endSec: 5.5 },
    ]);
    // The exact phrase objects, so the speaker overlay pass can skip them.
    expect(absorbed).toEqual([phrases[3], phrases[0]]);
  });

  it('keeps a phrase that starts in the canvas tail on the speaker and closes the board first', () => {
    const tooLate = { text: 'Last word', startTime: 29, endTime: 29.8 };
    const { notes, closeBySec } = buildSceneCanvasNotes(group, [tooLate]);
    expect(notes).toEqual([]);
    expect(closeBySec).toBe(19);
    expect(buildSceneCanvasNotes(group, []).closeBySec).toBeUndefined();
  });

  it('writes a phrase that runs past the canvas end, clamped to the canvas', () => {
    const late = { text: 'Capable assistant', startTime: 27, endTime: 31 };
    const { notes, closeBySec } = buildSceneCanvasNotes(group, [late]);
    expect(notes).toEqual([{ id: 'note-0', text: 'Capable assistant', startSec: 17, endSec: 20 }]);
    expect(closeBySec).toBeUndefined();
  });

  it('fades the board out before a tail overlay starts', () => {
    const board = buildCanvasLayout(
      [
        { id: 'a', startSec: 0, endSec: 6, scene: { kind: 'statement', words: [] } },
        { id: 'b', startSec: 6, endSec: 12, scene: { kind: 'statement', words: [] } },
      ],
      12,
      [],
      11,
    );
    expect(canvasOpacity(board, 10.5)).toBe(1);
    expect(canvasOpacity(board, 11)).toBe(0);
  });
});

describe('scene canvas note layout', () => {
  const panels = [
    { id: 'a', startSec: 0, endSec: 6, scene: { kind: 'statement' as const, words: [] } },
    { id: 'b', startSec: 9, endSec: 15, scene: { kind: 'statement' as const, words: [] } },
  ];
  const notes = [
    { id: 'n0', text: 'Noob to pro', startSec: 2, endSec: 3 },
    { id: 'n1', text: 'Such a noisy phrase', startSec: 4, endSec: 5 },
    { id: 'n2', text: 'Hire more', startSec: 7.8, endSec: 8.5 },
  ];
  const layout = buildCanvasLayout(panels, 15, notes);

  it('anchors each note beside the panel it is spoken with, never inside a panel', () => {
    expect(layout.notes.map((n) => n.anchor)).toEqual([0, 0, 1]);
    for (const n of layout.notes)
      for (const box of layout.panels) {
        const overlapX = n.x < box.x + box.width && n.x + n.w > box.x;
        const overlapY = n.y < box.y + box.height && n.y + n.h > box.y;
        expect(overlapX && overlapY).toBe(false);
      }
  });

  it('cycles through write, circled and sticky looks', () => {
    expect(layout.notes.map((n) => n.style)).toEqual(['write', 'circled', 'sticky']);
  });

  it('moves the camera to take in each note as it is written', () => {
    for (const n of layout.notes.filter((x) => x.anchor === 0)) {
      const pose = canvasCameraAt(layout, n.at + 1, 'seed');
      const halfW = 1920 / 2 / pose.zoom;
      const halfH = 1080 / 2 / pose.zoom;
      expect(n.x).toBeGreaterThan(pose.x - halfW);
      expect(n.x + n.w).toBeLessThan(pose.x + halfW);
      expect(n.y).toBeGreaterThan(pose.y - halfH);
      expect(n.y + n.h).toBeLessThan(pose.y + halfH);
    }
  });

  it('keeps the board up while notes are still being written', () => {
    // Panel a has no beats, but its notes run to 4 s + read time: no speaker break before then.
    expect(canvasOpacity(layout, 5.5)).toBe(1);
  });

  it('never lets a later note cover an earlier one, even with long phrases', () => {
    const crowded = buildCanvasLayout(
      [{ id: 'a', startSec: 0, endSec: 40, scene: { kind: 'statement', words: [] } }],
      40,
      [
        'Why this even matters',
        'Such a noisy phrase',
        'Actual problem',
        "What they're actually building toward",
        'Margin does not move',
        'Hire a salesperson',
        'The ceiling is still real',
        'Copy and paste tier',
      ].map((text, i) => ({ id: `n${i}`, text, startSec: 1 + i * 4, endSec: 2 + i * 4 })),
    );
    const pad = (n: (typeof crowded.notes)[number]) => (n.style === 'circled' ? 40 : 16);
    for (const [i, a] of crowded.notes.entries())
      for (const b of crowded.notes.slice(i + 1)) {
        const pa = pad(a);
        const pb = pad(b);
        const overlapX = a.x - pa < b.x + b.w + pb && b.x - pb < a.x + a.w + pa;
        const overlapY = a.y - pa < b.y + b.h + pb && b.y - pb < a.y + a.h + pa;
        expect(overlapX && overlapY, `${a.text} / ${b.text}`).toBe(false);
      }
  });

  it('finds free space after more than six tiers are occupied', () => {
    const crowded = buildCanvasLayout(
      [{ id: 'a', startSec: 0, endSec: 90, scene: { kind: 'statement', words: [] } }],
      90,
      Array.from({ length: 40 }, (_, i) => ({
        id: `crowded-${i}`,
        text: 'A long phrase that needs space on the board',
        startSec: 1 + i * 2,
        endSec: 2 + i * 2,
      })),
    );
    expect(crowded.notes).toHaveLength(40);
    for (const [i, a] of crowded.notes.entries())
      for (const b of crowded.notes.slice(i + 1)) {
        const pa = a.style === 'circled' ? 40 : 16;
        const pb = b.style === 'circled' ? 40 : 16;
        const overlapX = a.x - pa < b.x + b.w + pb && b.x - pb < a.x + a.w + pa;
        const overlapY = a.y - pa < b.y + b.h + pb && b.y - pb < a.y + a.h + pa;
        expect(overlapX && overlapY, `${a.id} / ${b.id}`).toBe(false);
      }
  });

  it('sizes sticky notes to hold their text at a readable size', () => {
    const sticky = layout.notes.find((n) => n.style === 'sticky');
    expect(sticky?.size).toBeGreaterThanOrEqual(40);
    expect(sticky?.h).toBeGreaterThanOrEqual(260);
  });
});

describe('speaker breaks inside a panel', () => {
  const panels = [
    {
      id: 'a',
      startSec: 0,
      endSec: 20,
      scene: {
        kind: 'statement' as const,
        words: [
          { text: 'Human', at: 1 },
          { text: 'bandwidth', at: 1.6 },
          { text: 'Ceiling', at: 14 },
        ],
      },
    },
    { id: 'b', startSec: 20, endSec: 26, scene: { kind: 'statement' as const, words: [] } },
  ];

  it('goes back to the speaker while a finished drawing waits, then returns before the next', () => {
    const board = buildCanvasLayout(panels, 26);
    expect(canvasOpacity(board, 2.5)).toBe(1);
    expect(canvasOpacity(board, 8)).toBe(0);
    // Back on the board half a second before the next drawing appears.
    expect(canvasOpacity(board, 13.5)).toBe(1);
  });

  it('returns for a note written during the wait', () => {
    const board = buildCanvasLayout(panels, 26, [
      { id: 'n0', text: 'Hire a salesperson', startSec: 8, endSec: 9 },
    ]);
    expect(canvasOpacity(board, 5.5)).toBe(0);
    expect(canvasOpacity(board, 7.8)).toBe(1);
    expect(canvasOpacity(board, 9.5)).toBe(1);
    expect(canvasOpacity(board, 12)).toBe(0);
  });

  it('returns for an anchored note before the next panel starts drawing', () => {
    const board = buildCanvasLayout(
      [
        {
          id: 'a',
          startSec: 0,
          endSec: 6,
          scene: { kind: 'statement', words: [{ text: 'First', at: 1 }] },
        },
        {
          id: 'b',
          startSec: 20,
          endSec: 30,
          scene: { kind: 'statement', words: [{ text: 'Later', at: 5 }] },
        },
      ],
      30,
      [{ id: 'early', text: 'An early note', startSec: 19, endSec: 20 }],
    );
    expect(board.notes[0]?.anchor).toBe(1);
    expect(canvasOpacity(board, 12)).toBe(0);
    expect(canvasOpacity(board, 18.65)).toBe(1);
    expect(canvasOpacity(board, 19)).toBe(1);
  });

  it('keeps the board up when drawings follow each other closely', () => {
    const busy = buildCanvasLayout(
      [
        {
          id: 'a',
          startSec: 0,
          endSec: 8,
          scene: {
            kind: 'statement',
            words: [1, 2.5, 4, 5.5, 7].map((at) => ({ text: 'x', at })),
          },
        },
      ],
      8,
    );
    for (let t = 0.6; t < 7.5; t += 0.1) expect(canvasOpacity(busy, t)).toBe(1);
  });
});

describe('settled panel motion', () => {
  const fps = 30;
  const scene = {
    kind: 'statement' as const,
    words: [
      { text: 'One', at: 1 },
      { text: 'Two', at: 3 },
    ],
  };
  const ownSec = 12;
  const settle = panelSettleSec(scene, ownSec);
  const last = Math.round(ownSec * fps) - 1;
  const at = (frame: number) => panelIdleAt(frame / fps, settle, fps, 'panel-a');

  it('settles after the last beat, never past the panel window', () => {
    expect(settle).toBeCloseTo(3 + PANEL_IDLE.settleAfterLastBeatSec, 6);
    expect(panelSettleSec({ kind: 'statement', words: [{ text: 'Late', at: 11.5 }] }, 12)).toBe(12);
  });

  it('is not frozen past the panel end frame, and a repeated frame is identical', () => {
    const a = at(last + 10);
    const b = at(last + 25);
    expect(a).not.toEqual(b);
    expect(Math.abs(a.y - b.y) + Math.abs(a.rotateY - b.rotateY)).toBeGreaterThan(0.05);
    expect(at(last + 10)).toEqual(a);
    expect(idleTransform(at(last + 10))).toBe(idleTransform(a));
  });

  it('eases in from rest at the settle point with no jump', () => {
    const settleFrame = Math.ceil(settle * fps);
    expect(panelIdleAt(settle - 0.5, settle, fps, 'panel-a')).toEqual(NO_IDLE);
    expect(panelIdleAt(settle, settle, fps, 'panel-a')).toEqual(NO_IDLE);
    const first = at(settleFrame + 1);
    expect(Math.abs(first.x) + Math.abs(first.y)).toBeLessThan(0.2);
    expect(Math.abs(first.rotateY)).toBeLessThan(0.05);
  });

  it('stays restrained: small float, tilt, orbit and pulse at every frame', () => {
    for (let frame = 0; frame < 120 * fps; frame += 7) {
      const idle = at(frame);
      expect(Math.abs(idle.x)).toBeLessThanOrEqual(PANEL_IDLE.floatPx * 1.2 + 1e-9);
      expect(Math.abs(idle.y)).toBeLessThanOrEqual(PANEL_IDLE.floatPx * 2 + 1e-9);
      expect(Math.abs(idle.rotateY)).toBeLessThanOrEqual(PANEL_IDLE.tiltDeg * 2 + 1e-9);
      expect(Math.abs(idle.orbitDeg)).toBeLessThanOrEqual(PANEL_IDLE.orbitDeg + 1e-9);
      expect(idle.scale).toBeGreaterThanOrEqual(1);
      expect(idle.scale).toBeLessThanOrEqual(1 + PANEL_IDLE.pulseScale + 1e-9);
    }
  });

  it('pulses once per cadence after settling', () => {
    const pulseAt = settle + PANEL_IDLE.pulseEverySec;
    const peak = Math.max(
      ...Array.from({ length: 20 }, (_, i) => at(Math.round(pulseAt * fps) + i).scale),
    );
    expect(peak).toBeGreaterThan(1.005);
    expect(at(Math.round((pulseAt - 1) * fps)).scale).toBe(1);
  });
});
