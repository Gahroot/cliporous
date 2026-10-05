import { readFileSync } from 'node:fs';
import {
  type ComponentProps,
  type ComponentType,
  createElement as h,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_PALETTES } from '../../../../shared/palettes';
import { resolveStoryboardPalette } from '../../../../shared/storyboard-palette';
import { type LegacyStoryboardPanel, STORYBOARD_MODELS } from '../../../../shared/storyboards';
import { BOARD_MODELS } from '../../../ai/storyboards/catalog';
import { compileStoryboard } from '../../../ai/storyboards/compiler';
import { HERO_PROP_DEFS } from '../explainer/HeroProps';
import { ExplainerProvider, useStage } from '../explainer/stage';
import { BoardProps3D } from './BoardProps3D';
import { assertStoryboardBudgets } from './budgets';
import { BoardElementView } from './elements';
import { boardLook } from './look';
import { assertModelBudget, BOARD_MODEL_MESH_LIMITS } from './model-resources';
import { PROOF_SPEC, ProofBoard } from './proof-root';
import { StoryBoard } from './StoryBoard';
import type { BoardElement, BoardProp, StoryBoardSpec } from './types';

// createElement supplies children as its third argument; expose that standard React signature.
const TestExplainerProvider = ExplainerProvider as ComponentType<
  PropsWithChildren<Omit<ComponentProps<typeof ExplainerProvider>, 'children'>>
>;

const clock = vi.hoisted(() => ({ frame: 90 }));
vi.mock('remotion', async (original) => {
  const actual = await original<typeof import('remotion')>();
  const React = await import('react');
  const Frame = React.createContext<number | null>(null);
  return {
    ...actual,
    registerRoot: vi.fn(),
    staticFile: (path: string) => `/${path}`,
    OffthreadVideo: ({ src }: { src: string }) => h('video', { src }),
    useCurrentFrame: () => React.useContext(Frame) ?? clock.frame,
    useVideoConfig: () => ({
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 240,
      id: 'storyboard-test',
    }),
    Freeze: ({ frame, children }: { frame: number; children: ReactNode }) =>
      h(Frame.Provider, { value: frame }, children),
    AbsoluteFill: ({ children, style }: { children: ReactNode; style?: object }) =>
      h('div', { style }, children),
  };
});
// Substitute only the WebGL host. The real board, stage, provider, adapters and model subtrees render.
vi.mock('@remotion/three', () => ({
  ThreeCanvas: ({ children }: { children: ReactNode }) =>
    h('section', { 'data-three-canvas': 'true' }, children),
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: { camera: object }) => unknown) => select({ camera: {} }),
}));
vi.mock('../explainer/StudioEnvironment', () => ({ StudioEnvironment: () => null }));
vi.mock('./BoardFonts', () => ({ BoardFonts: () => null }));

const base: StoryBoardSpec = {
  durationSec: 8,
  shots: [{ at: 0, dur: 0, x: 700, y: 410, zoom: 1.1 }],
  elements: [],
  props: [],
  boardIn: { at: 0.25, dur: 0.25 },
  boardOut: { at: 7.5, dur: 0.25 },
};
const prop: BoardProp = {
  id: 'lamp',
  semanticId: 'lamp',
  model: 'lightbulb',
  action: 'activate',
  at: 1,
  actionEndAt: 2,
  x: 700,
  y: 410,
  size: 200,
};
const render = (spec = base, style: 'polish' | 'ink' = 'polish', palette = BUILTIN_PALETTES[0]) =>
  renderToStaticMarkup(h(StoryBoard, { spec, style, palette }));

beforeEach(() => {
  clock.frame = 90;
  // React DOM warns about Three's non-DOM mesh/material props. WebGL is intentionally not mounted here.
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (/incorrect casing|does not recognize|non-boolean attribute/.test(message)) return;
    throw new Error(args.map(String).join(' '));
  });
});
afterEach(() => vi.restoreAllMocks());

describe('production React composition', () => {
  it('keeps compiled panel frames plain and enables chrome only for explicitly authored windows', () => {
    const frame: Extract<BoardElement, { kind: 'frame' }> = {
      kind: 'frame',
      id: 'card',
      at: 0,
      x: 10,
      y: 20,
      w: 600,
      h: 400,
    };
    for (const style of ['ink', 'polish'] as const) {
      const look = boardLook(style, BUILTIN_PALETTES[0]);
      const draw = (el: typeof frame) =>
        renderToStaticMarkup(h(BoardElementView, { el, t: 3, fps: 30, look }));
      const plain = draw(frame);
      expect(plain).not.toContain('data-frame-chrome');
      expect(plain).not.toContain('<circle');
      expect(plain).not.toContain('border-bottom');
      if (style === 'ink') expect(plain.match(/<path/g)).toHaveLength(1);
      else expect(plain).toContain(`background:${look.cardRaised}`);
      for (const authored of [{ title: [{ text: 'Editor', at: 0 }] }, { rows: 3 }, { rowsAt: 0 }]) {
        const window = draw({ ...frame, ...authored });
        expect(window).toContain('data-frame-chrome');
        if (style === 'ink') expect(window.match(/<circle/g)).toHaveLength(3);
        else expect(window).toContain('border-bottom');
      }
    }
  });
  it('accepts harmless one-frame Root defaults and the unchanged private prototype through its adapter', () => {
    const tiny = {
      ...base,
      durationSec: 1 / 30,
      boardIn: { at: 0, dur: 0 },
      boardOut: { at: 0, dur: 0 },
      shots: [{ at: 0, dur: 0, x: 0, y: 0, zoom: 1 }],
    };
    expect(() => assertStoryboardBudgets(tiny)).not.toThrow();
    clock.frame = 0;
    expect(render(tiny)).toBe('<div></div>');
    expect(() => assertStoryboardBudgets(PROOF_SPEC)).not.toThrow();
    clock.frame = 900;
    expect(renderToStaticMarkup(h(ProofBoard, { skin: 'ink', withSource: true }))).toContain(
      '/proof-source.mp4',
    );
    expect(
      renderToStaticMarkup(h(ProofBoard, { skin: 'polish', speakerSrc: '/private-speaker.mp4' })),
    ).toContain('/private-speaker.mp4');
  });
  it('mounts zero canvases for pure 2D, one for six props and none when culled; never nests canvases', () => {
    expect(render()).not.toContain('data-three-canvas');
    const props = Array.from({ length: 6 }, (_, i) => ({
      ...prop,
      id: `lamp-${i}`,
      x: 400 + i * 100,
    }));
    const html = render({ ...base, props });
    expect(html.match(/data-three-canvas=/g)).toHaveLength(1);
    expect(html.match(/<section/g)).toHaveLength(1);
    expect(render({ ...base, props: [{ ...prop, x: 10000 }] })).not.toContain('data-three-canvas');
    clock.frame = 0;
    expect(render({ ...base, props })).not.toContain('data-three-canvas');
    clock.frame = 239;
    expect(render({ ...base, props })).not.toContain('data-three-canvas');
  });
  it('renders repeatably on reverse seeks and holds real model subtrees after actions', () => {
    for (const model of STORYBOARD_MODELS) {
      const spec = { ...base, props: [{ ...prop, model }] };
      clock.frame = 90;
      const held = render(spec);
      clock.frame = 150;
      expect(render(spec)).toBe(held);
      clock.frame = 36;
      render(spec);
      clock.frame = 90;
      expect(render(spec)).toBe(held);
    }
  });
  it('passes shared roles through both treatments and the model provider for all eight palettes', () => {
    expect(BUILTIN_PALETTES).toHaveLength(8);
    const Probe = () => h('output', null, JSON.stringify(useStage()));
    for (const palette of BUILTIN_PALETTES)
      for (const style of ['ink', 'polish'] as const) {
        const p = resolveStoryboardPalette(style, palette);
        const look = boardLook(style, palette);
        expect(look).toMatchObject({
          backdrop: p.canvas,
          paper: p.paper,
          card: p.card,
          cardRaised: p.cardRaised,
          ink: p.ink,
          muted: p.muted,
          line: p.stroke,
          accent: p.accent,
          highlight: p.marker,
          highlightText: p.markerText,
          noteFill: p.note,
          noteText: p.noteText,
          tape: p.tape,
          tapeText: p.tapeText,
          shadow: p.shadow,
        });
        expect(look.palette).toMatchObject({
          bgOuter: p.canvas,
          text: p.ink,
          accent: p.accent,
          accent2: p.accent2,
          clay: p.clay,
          positive: p.accent,
          negative: p.accent2,
        });
        const html = renderToStaticMarkup(
          h(TestExplainerProvider, { value: { palette: look.palette } }, h(Probe)),
        );
        expect(html).toContain(p.accent);
        expect(html).toContain(p.clay[0]);
        expect(render(base, style, palette)).toContain(`background:${p.canvas}`);
      }
  });
  it('renders the exact counter and wraps the complete label through the actual element dispatcher', () => {
    const look = boardLook('ink', BUILTIN_PALETTES[0]);
    const el = {
      kind: 'counter' as const,
      id: 'quantity',
      at: 1,
      x: 0,
      y: 0,
      value: 12345.67,
      unit: 'source credits',
      width: 400,
      size: 40,
    };
    const html = renderToStaticMarkup(h(BoardElementView, { el, t: 4, fps: 30, look }));
    expect(html).toContain('12345.67');
    expect(html).toContain('credits');
    expect(renderToStaticMarkup(h(BoardElementView, { el, t: 0, fps: 30, look }))).toBe('');
    expect(renderToStaticMarkup(h(BoardElementView, { el, t: 30, fps: 30, look }))).toBe(html);
  });
  it('uses and verifies cumulative model declarations against real adapter mesh counts and compiler ceilings', () => {
    const palette = boardLook('polish', BUILTIN_PALETTES[0]).palette;
    for (const model of STORYBOARD_MODELS) {
      expect(BOARD_MODEL_MESH_LIMITS[model]).toBe(BOARD_MODELS[model].meshes);
      for (const frame of [0, 15, 45, 90, 195]) {
        clock.frame = frame;
        const html = renderToStaticMarkup(
          h(
            TestExplainerProvider,
            { value: { palette } },
            h(HERO_PROP_DEFS[model].Model, { at: 0, tone: 'up' }),
          ),
        );
        const meshes = html.match(/<mesh(?:\s|>)/g)?.length ?? 0;
        expect(meshes, model).toBeGreaterThan(0);
        expect(meshes, model).toBeLessThanOrEqual(BOARD_MODEL_MESH_LIMITS[model]);
      }
    }
    const expensive = Array.from({ length: 4 }, (_, i) => ({
      ...prop,
      id: `book-${i}`,
      model: 'book' as const,
    }));
    expect(() => assertModelBudget(expensive)).toThrow(/mesh budget/);
    expect(() => assertStoryboardBudgets({ ...base, props: expensive })).toThrow(/mesh budget/);
    expect(() =>
      renderToStaticMarkup(
        h(BoardProps3D, {
          props: expensive,
          elements: [],
          cam: { x: 0, y: 0, zoom: 1 },
          t: 3,
          width: 1920,
          height: 1080,
        }),
      ),
    ).toThrow(/mesh budget/);
  });
  it('consumes all six current compiler treatments including top-left sized notes and source arrows', () => {
    const label = (text: string) => ({ text, startWord: 0, endWord: 1 });
    const common = {
      id: 'panel',
      startWord: 0,
      endWord: 20,
      title: label('A source title'),
      revealWord: 0,
      moveWord: 0,
    };
    const panels: LegacyStoryboardPanel[] = [
      { ...common, kind: 'statement', body: label('A source statement') },
      {
        ...common,
        kind: 'comparison',
        left: label('First source'),
        right: label('Second source'),
        evidence: { startWord: 0, endWord: 20 },
      },
      {
        ...common,
        kind: 'process',
        items: [label('First step'), label('Next step')],
        relationship: 'sequence',
        evidence: { startWord: 0, endWord: 20 },
      },
      { ...common, kind: 'notes', items: [label('Source note'), label('Another note')] },
      {
        ...common,
        kind: 'quantity',
        value: 12345.67,
        unit: label('credits'),
        evidence: label('12345.67 credits'),
      },
      {
        ...common,
        kind: 'hero',
        caption: label('A lightbulb turns on'),
        prop: {
          id: 'lamp',
          model: 'lightbulb',
          action: 'activate',
          atWord: 2,
          evidence: { startWord: 0, endWord: 20 },
        },
      },
    ];
    for (const panel of panels) {
      const compiled = compileStoryboard({
        spec: {
          kind: 'storyboard',
          specVersion: 1,
          subject: label('A subject'),
          startWord: 0,
          endWord: 20,
          panels: [panel],
        },
        startTime: 0,
        endTime: 8,
        panels: [
          {
            revealAt: 0.5,
            moveAt: 0.5,
            labelsAt: [0.5, 1, 1.5, 2, 2.5],
            propAt: 1,
            actionEndAt: 2,
          },
        ],
      });
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
      for (const style of ['ink', 'polish'] as const) {
        const html = render(compiled.value.board, style);
        expect(html).toContain('A source title');
        if (panel.kind === 'quantity') expect(html).toContain('12345.67');
        if (panel.kind === 'process') expect(html).toContain('<path');
        if (panel.kind === 'notes') {
          const note = compiled.value.board.elements.find((el) => el.kind === 'note');
          if (note?.kind !== 'note') throw new Error('Compiler omitted note');
          const noteHtml = renderToStaticMarkup(
            h(BoardElementView, {
              el: note,
              t: 4,
              fps: 30,
              look: boardLook(style, BUILTIN_PALETTES[0]),
            }),
          );
          expect(noteHtml).toContain(`left:${note.x}px;top:${note.y}px`);
        }
      }
    }
  });
  it('keeps proof assets out of production modules', () => {
    for (const name of [
      'StoryBoard.tsx',
      'BoardProps3D.tsx',
      'elements.tsx',
      'look.ts',
      'BoardFonts.tsx',
      'prop-state.ts',
    ]) {
      const source = readFileSync(new URL(name, import.meta.url), 'utf8');
      expect(source).not.toContain('proof-source.mp4');
      expect(source).not.toContain("from './board-proof'");
    }
  });
});
