import { createElement as h, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactBusinessSourceChoices } from '../../../../shared/business-source-choices';
import { BUILTIN_PALETTES } from '../../../../shared/palettes';
import { STORYBOARD_LIMITS } from '../../../../shared/storyboards';
import { parseLongformSceneSpec } from '../../../ai/explainer-scenes';
import { isBusinessStoryboardScene } from '../../../ai/storyboards/business-diagrams';
import { compileStoryboard, compileStoryboardSpec } from '../../../ai/storyboards/compiler';
import { parseStoryboardSpec } from '../../../ai/storyboards/contract';
import { boardFixture } from '../../../ai/storyboards/fixtures';
import { mapStoryboardTimes } from '../../../render/longform-storyboard-props';
import {
  businessSourceFixture,
  businessSourceFixtures,
} from '../explainer/business/source-fixtures';
import type { BusinessRecipeId } from '../explainer/business/types';
import { BoardProps3D } from './BoardProps3D';
import { assertStoryboardBudgets } from './budgets';
import {
  businessPanelClock,
  businessPanelNativePose,
  businessPanelResources,
} from './business-panel-state';
import type { BoardBusinessPanel } from './business-types';
import { boardLook } from './look';
import { StoryBoard } from './StoryBoard';
import type { StoryBoardSpec } from './types';

// Only replace the WebGL host/environment and fonts, never source facts or native groups.
const clock = vi.hoisted(() => ({ frame: 90 }));
vi.mock('remotion', async (original) => {
  const actual = await original<typeof import('remotion')>();
  const React = await import('react');
  const Frame = React.createContext<number | null>(null);
  return {
    ...actual,
    registerRoot: vi.fn(),
    staticFile: (path: string) => `/${path}`,
    useCurrentFrame: () => React.useContext(Frame) ?? clock.frame,
    useVideoConfig: () => ({
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 3600,
      id: 'business-board-test',
    }),
    Freeze: ({ frame, children }: { frame: number; children: ReactNode }) =>
      h(Frame.Provider, { value: frame }, children),
    AbsoluteFill: ({ children, style }: { children: ReactNode; style?: object }) =>
      h('div', { style }, children),
  };
});
vi.mock('@remotion/three', () => ({
  ThreeCanvas: ({ children }: { children: ReactNode }) =>
    h('section', { 'data-three-canvas': 'true' }, children),
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: { camera: object }) => unknown) => select({ camera: {} }),
}));
vi.mock('../explainer/StudioEnvironment', () => ({ StudioEnvironment: () => null }));
vi.mock('./BoardFonts', () => ({ BoardFonts: () => null }));

beforeEach(() => {
  clock.frame = 90;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (/incorrect casing|does not recognize|non-boolean attribute/.test(String(args[0]))) return;
    throw new Error(args.map(String).join(' '));
  });
});
afterEach(() => vi.restoreAllMocks());

function sourceBoard(id: BusinessRecipeId, mode: 'diagram' | 'hybrid', offset = 17, hold = 12) {
  const source = businessSourceFixture(id, mode);
  if (!source) throw new Error(`Missing real source ${id}/${mode}`);
  const compact = compactBusinessSourceChoices(source.raw);
  if (!compact.ok) throw new Error(compact.message);
  const last = source.words.at(-1);
  if (!last) throw new Error('Missing source words');
  const words = [
    ...source.words,
    { text: 'Context', start: last.end + hold, end: last.end + hold + 0.3 },
  ].map((word) => ({ ...word, start: word.start + offset, end: word.end + offset }));
  const title = { text: words[0].text, startWord: 0, endWord: 0 };
  const spec = {
    kind: 'storyboard',
    specVersion: 2,
    startWord: 0,
    endWord: words.length - 1,
    subject: title,
    panels: [
      {
        kind: 'explanation',
        id: 'business',
        startWord: 0,
        endWord: words.length - 1,
        revealWord: 0,
        moveWord: 0,
        title,
        explanation: {
          sourceVersion: 2,
          recipe: id,
          sourceChoices: compact.choices,
          identityLinks: [],
        },
      },
    ],
  };
  const parsed = parseStoryboardSpec(spec, words, { clipStart: 0, clipEnd: 120 });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  return { source, words, spec, parsed: parsed.value };
}
function compiled(input: ReturnType<typeof sourceBoard>) {
  const result = compileStoryboard(input.parsed);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value.board;
}
const render = (
  spec: StoryBoardSpec,
  style: 'ink' | 'polish' = 'ink',
  palette = BUILTIN_PALETTES[0],
) => renderToStaticMarkup(h(StoryBoard, { spec, style, palette }));
function nativeRender(spec: StoryBoardSpec, t: number, x = spec.shots[0].x) {
  return renderToStaticMarkup(
    h(BoardProps3D, {
      props: spec.props,
      elements: spec.elements,
      businessPanels: spec.businessPanels,
      cam: { ...spec.shots[0], x },
      t,
      width: 1920,
      height: 1080,
    }),
  );
}

function assertClockShift(before: unknown, after: unknown, shift: number, key = ''): void {
  if (typeof before === 'number') {
    expect(after).toBeCloseTo(before + (key === 'at' || key.endsWith('At') ? shift : 0), 10);
  } else if (Array.isArray(before)) {
    expect(after).toHaveLength(before.length);
    before.forEach((value, i) => {
      assertClockShift(value, (after as unknown[])[i], shift);
    });
  } else if (before && typeof before === 'object') {
    const next = after as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(Object.keys(before));
    for (const [name, value] of Object.entries(before))
      assertClockShift(value, next[name], shift, name);
  } else expect(after).toEqual(before);
}

// Same conservative advance model as the authored layout; not a font/GPU measurement.
function textHeight(text: string, width: number, size: number) {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/u)) {
    const advance = [...word].reduce(
      (sum, char) => sum + (/[MW@#%]|[^\u0020-\u007e]/u.test(char) ? 1 : 0.8),
      0,
    );
    expect(advance).toBeLessThanOrEqual(Math.floor(width / size));
    if (used && used + 1 + advance > Math.floor(width / size)) {
      lines++;
      used = 0;
    }
    used += (used ? 1 : 0) + advance;
  }
  return lines * size * 1.2;
}

describe('Step27 real business source → compiler → root integration', () => {
  it('owns OP-17 hybrid geometry, disjoint complete text/model rails and focused physical readability', () => {
    const input = sourceBoard('OP-17', 'hybrid');
    const original = JSON.stringify(input.spec);
    const spec = compiled(input);
    const panel = spec.businessPanels?.[0];
    if (!panel?.modelRail) throw new Error('Missing compiler-owned model rail');
    expect(panel).toMatchObject({ x: 0, y: 0, width: 2080, height: 1060 });
    expect(panel.modelRail).toEqual({ x: 1360, y: 330, width: 640, height: 650 });
    expect(spec.worldBounds).toEqual({ x: 0, y: 0, width: 2080, height: 1060 });
    expect(spec.shots[0]).toMatchObject({ x: 1040, y: 530, zoom: 1760 / 2080 });
    const text = spec.elements.filter((el) => el.kind === 'text' && el.id.includes(':business:'));
    expect(text.length).toBeGreaterThan(0);
    for (const el of text) {
      if (el.kind !== 'text') throw new Error('Expected text');
      expect(el.x).toBe(80);
      expect(el.width).toBe(1240);
      expect(el.x + (el.width ?? 0)).toBe(panel.modelRail.x - 40);
      expect(el.y).toBeGreaterThanOrEqual(330);
      expect(el.y + textHeight(el.text, el.width ?? 0, el.size ?? 0)).toBeLessThanOrEqual(980);
      expect(el.size).toBeGreaterThanOrEqual(36);
      expect((el.size ?? 0) * spec.shots[0].zoom).toBeGreaterThanOrEqual(30);
    }
    expect(JSON.stringify(input.spec)).toBe(original);
    const injected = structuredClone(input.spec);
    Object.assign(injected.panels[0].explanation.sourceChoices, { modelRail: { x: 0 }, width: 1 });
    expect(compileStoryboardSpec(injected, input.words, { clipStart: 0, clipEnd: 120 }).ok).toBe(
      false,
    );
  });

  it.each([
    ['OP-17', 'hybrid', 1],
    ['OP-01', 'diagram', 0],
  ] as const)('%s/%s preserves native clocks/facts, palette and zero/one shared root canvas on held/backward seeks', (id, mode, canvases) => {
    const input = sourceBoard(id, mode);
    const spec = compiled(input);
    const panel = spec.businessPanels?.[0];
    const reconstruction = input.parsed.businessPanels?.get('business')?.reconstruction.planned;
    if (!panel || !reconstruction) throw new Error('Missing native source reconstruction');
    expect(panel.scene).toEqual(reconstruction.scene);
    expect(panel.startAt).toBe(reconstruction.startTime);
    expect(panel.endAt).toBe(reconstruction.endTime);
    const zero = compiled(sourceBoard(id, mode, 0)).businessPanels?.[0];
    if (!zero) throw new Error('Missing zero-offset panel');
    assertClockShift(zero.scene, panel.scene, 17);
    const local = mapStoryboardTimes(spec, (t) => t - 7).businessPanels?.[0];
    if (!local) throw new Error('Missing mapped panel');
    assertClockShift(panel.scene, local.scene, -7);
    expect(local.startAt).toBe(panel.startAt - 7);
    expect(local.endAt).toBe(panel.endAt - 7);
    expect(businessPanelClock(panel, panel.endAt + 10)).toBe(panel.scene.resolveAt);
    const held = businessPanelNativePose(panel, panel.endAt + 1);
    businessPanelNativePose(panel, panel.startAt);
    expect(businessPanelNativePose(panel, panel.endAt + 10)).toEqual(held);
    const native = nativeRender(spec, panel.endAt + 1);
    expect(native.match(/data-three-canvas=/g)?.length ?? 0).toBe(canvases);
    if (canvases) {
      expect(native.match(/<mesh(?:\s|>)/g)?.length ?? 0).toBeGreaterThan(0);
      expect(nativeRender(spec, panel.endAt + 5)).toBe(native);
      nativeRender(spec, panel.startAt);
      expect(nativeRender(spec, panel.endAt + 1)).toBe(native);
      expect(nativeRender(spec, panel.endAt, 10000)).toBe('');
      expect(nativeRender(spec, panel.startAt - 1)).toBe('');
    } else {
      expect(panel).toMatchObject({ width: 1400, height: 820 });
      expect(panel.modelRail).toBeUndefined();
    }
    expect.soft(() => assertStoryboardBudgets(spec)).not.toThrow();
    for (const style of ['ink', 'polish'] as const)
      for (const palette of BUILTIN_PALETTES) {
        clock.frame = Math.round((panel.endAt + 1) * 30);
        const html = render(spec, style, palette);
        expect(html.match(/data-three-canvas=/g)?.length ?? 0).toBe(canvases);
        expect(html).toContain(`background:${boardLook(style, palette).backdrop}`);
        if (canvases) expect(html).toContain(boardLook(style, palette).palette.accent2);
        clock.frame = Math.round(panel.startAt * 30);
        render(spec, style, palette);
        clock.frame = Math.round((panel.endAt + 1) * 30);
        expect(render(spec, style, palette)).toBe(html);
      }
  });

  it.each([
    'OP-17',
    'OP-19',
    'OP-22',
  ] as const)('%s passes complete conditions/bases/unknown qualifiers through runtime budgets without truncation', (id) => {
    const input = sourceBoard(id, 'hybrid');
    const spec = compiled(input);
    const projection = input.parsed.businessPanels?.get('business')?.projection;
    if (!projection) throw new Error('Missing projection');
    const text = spec.elements.flatMap((el) => (el.kind === 'text' ? [el.text] : []));
    for (const label of [
      ...projection.headings,
      ...projection.rows.flatMap((row) => row.cells),
      ...projection.notes,
    ]) {
      expect(
        text.some((paragraph) => paragraph.includes(label)),
        label,
      ).toBe(true);
    }
    if (id === 'OP-22') expect(text.join(' ')).toContain('If approved');
    else expect(text.join(' ')).toMatch(/unknown/i);
    if (id === 'OP-19') expect(text.join(' ')).toMatch(/July/);
    expect(
      () => assertStoryboardBudgets(spec),
      JSON.stringify(text.map((value) => ({ length: value.length, value }))),
    ).not.toThrow();
    clock.frame = 900;
    expect(() => render(spec)).not.toThrow();
  });

  it.each([
    'changed qualifier',
    'missing qualifier',
    'metadata mismatch',
    'missing metadata',
    'duplicate metadata',
    'over seven paragraphs',
    'oversized paragraph',
    'foreign paragraph id',
    'unregistered long text',
  ] as const)('rejects %s without a generic business text exemption', (mutation) => {
    const original = compiled(sourceBoard('OP-22', 'hybrid'));
    expect(() => assertStoryboardBudgets(original)).not.toThrow();
    const spec = structuredClone(original);
    const panel = spec.businessPanels?.[0];
    const paragraph = panel?.paragraphs?.find((entry) => entry.text.includes('If approved'));
    if (!panel?.paragraphs || !paragraph) throw new Error('Missing compiled condition paragraph');
    const element = spec.elements.find((entry) => entry.id === paragraph.id);
    if (element?.kind !== 'text') throw new Error('Missing matching text primitive');
    expect(element.text).toBe(paragraph.text);
    expect(element.text.length).toBeGreaterThan(STORYBOARD_LIMITS.maxLabelChars);
    switch (mutation) {
      case 'changed qualifier':
        element.text = element.text.replace('If approved', 'approved');
        break;
      case 'missing qualifier':
        spec.elements = spec.elements.filter((entry) => entry.id !== paragraph.id);
        break;
      case 'metadata mismatch':
        paragraph.text = paragraph.text.replace('If approved', 'approved');
        break;
      case 'missing metadata':
        panel.paragraphs = [];
        break;
      case 'duplicate metadata':
        panel.paragraphs.push({ ...paragraph });
        break;
      case 'over seven paragraphs':
        while (panel.paragraphs.length < 8) {
          const id = `${panel.id}:business:extra-${panel.paragraphs.length}`;
          panel.paragraphs.push({ id, text: 'Source context' });
          spec.elements.push({ ...element, id, text: 'Source context' });
        }
        break;
      case 'oversized paragraph':
        // Even a matching compiler-shaped element/record cannot waive the internal cap.
        paragraph.text = 'x'.repeat(4125);
        element.text = paragraph.text;
        break;
      case 'foreign paragraph id':
        paragraph.id = 'legacy:body';
        element.id = paragraph.id;
        break;
      case 'unregistered long text':
        spec.elements.push({ ...element, id: `${panel.id}:business:unregistered` });
        break;
    }
    expect(() => assertStoryboardBudgets(spec)).toThrow(/paragraph|text budget/i);
    clock.frame = 900;
    expect(() => render(spec)).toThrow(/paragraph|text budget/i);
    expect(() => assertStoryboardBudgets(original)).not.toThrow();
  });

  it.each([
    'ordinary legacy id',
    'business-shaped id',
  ] as const)('retains the legacy 96-character text cap for %s', (identity) => {
    const input = boardFixture('statement');
    const result = compileStoryboardSpec(input.spec, input.words, {
      clipStart: 0,
      clipEnd: input.duration,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const spec = result.value.board;
    expect(() => assertStoryboardBudgets(spec)).not.toThrow();
    const element = spec.elements.find((entry) => entry.kind === 'text');
    if (element?.kind !== 'text') throw new Error('Missing legacy text');
    element.text = 'x'.repeat(97);
    if (identity === 'business-shaped id') element.id = 'business:business:notes';
    expect(spec.businessPanels ?? []).toEqual([]);
    expect(() => assertStoryboardBudgets(spec)).toThrow(/text budget/);
    expect(() => render(spec)).toThrow(/text budget/);
  });

  it('rejects native sources above six assemblies at candidate compilation without thinning facts', () => {
    const over = businessSourceFixtures().find((source) => {
      if (source.visualMode !== 'hybrid') return false;
      const native = parseLongformSceneSpec(source.raw, source.words, {
        clipStart: 0,
        clipEnd: 90,
      });
      if (!native || !isBusinessStoryboardScene(native.scene)) return false;
      return (
        businessPanelResources({
          id: source.fixtureId,
          recipe: source.id as BoardBusinessPanel['recipe'],
          scene: native.scene,
          x: 0,
          y: 0,
          width: 2080,
          height: 1060,
          startAt: native.startTime,
          endAt: native.endTime,
          identityLinks: [],
        }).ceiling.modelInstances > 6
      );
    });
    if (!over) throw new Error('Missing authored over-six native source');
    const input = sourceBoard(over.id, 'hybrid', 17, 28);
    const native = input.parsed.businessPanels?.get('business')?.reconstruction.planned;
    if (!native || !isBusinessStoryboardScene(native.scene))
      throw new Error('Missing native source');
    const panel = {
      id: 'business',
      recipe: input.source.id as BoardBusinessPanel['recipe'],
      scene: native.scene,
      x: 0,
      y: 0,
      width: 2080,
      height: 1060,
      startAt: native.startTime,
      endAt: native.endTime,
      identityLinks: [],
    };
    const resources = businessPanelResources(panel);
    expect(resources.ceiling.modelInstances).toBeGreaterThan(6);
    const before = JSON.stringify(input);
    const result = compileStoryboard(input.parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.some((issue) => issue.code === 'budget')).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects a mixed source candidate rather than dropping legacy heroes or native assemblies', () => {
    const input = sourceBoard('OP-17', 'hybrid');
    const words = [...input.words];
    const panels: unknown[] = [...input.spec.panels];
    for (let i = 0; i < 3; i++) {
      const hero = boardFixture('hero', 'lightbulb', 'activate', (words.at(-1)?.end ?? 0) + 0.4);
      const offset = words.length + 1;
      const panel = JSON.parse(
        JSON.stringify(hero.spec.panels[0], (key, value) =>
          ['startWord', 'endWord', 'revealWord', 'moveWord', 'atWord'].includes(key)
            ? value + offset
            : value,
        ),
      );
      panel.id = `hero-${i}`;
      panel.prop.id = `lamp-${i}`;
      panel.startWord = offset - 1;
      panel.revealWord = offset - 1;
      panel.moveWord = offset - 1;
      panel.title = { text: 'Atlas', startWord: offset - 1, endWord: offset - 1 };
      panels.push(panel);
      const start = hero.words[0].start;
      words.push({ text: 'Atlas', start: start - 0.3, end: start - 0.1 });
      words.push(
        ...hero.words.map((word) => ({
          ...word,
          start: start + (word.start - start) * 0.4,
          end: start + (word.end - start) * 0.4,
        })),
      );
    }
    const mixed = { ...input.spec, panels, endWord: words.length - 1 };
    const before = JSON.stringify(mixed);
    const parsed = parseStoryboardSpec(mixed, words, { clipStart: 0, clipEnd: 120 });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    const result = compileStoryboard(parsed.value);
    expect(result.ok, JSON.stringify(result)).toBe(false);
    if (!result.ok)
      expect(
        result.diagnostics.some(
          (issue) =>
            issue.code === 'budget' &&
            issue.message === 'Compiled board exceeds authored resource bounds.',
        ),
      ).toBe(true);
    expect(JSON.stringify(mixed)).toBe(before);
  });

  it('enforces combined legacy/native six-prop and 180-mesh caps at runtime and the actual root', () => {
    const spec = compiled(sourceBoard('OP-17', 'hybrid'));
    const panel = spec.businessPanels?.[0];
    if (!panel) throw new Error('Missing native panel');
    const resources = businessPanelResources(panel).ceiling;
    expect(resources.modelInstances).toBeGreaterThan(0);
    const hero = boardFixture('hero', 'book');
    const result = compileStoryboardSpec(hero.spec, hero.words, {
      clipStart: 0,
      clipEnd: hero.duration,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    for (const [count, model] of [
      [7 - resources.modelInstances, 'lightbulb'],
      [4, 'book'],
    ] as const) {
      const props = Array.from({ length: count }, (_, i) => ({
        ...result.value.board.props[0],
        id: `hero-${i}`,
        model,
      }));
      const mixed = { ...spec, props };
      const before = JSON.stringify(mixed);
      expect(() => nativeRender(mixed, panel.endAt + 1)).toThrow(/cumulative model mesh budget/);
      expect.soft(() => assertStoryboardBudgets(mixed)).toThrow(/cumulative model mesh budget/);
      expect.soft(() => render(mixed)).toThrow(/cumulative model mesh budget/);
      expect(JSON.stringify(mixed)).toBe(before);
    }
  });

  it('retains spec1 exact geometry/source timing and unchanged global world limits', () => {
    expect(STORYBOARD_LIMITS).toMatchObject({
      maxWorldWidth: 8400,
      maxWorldHeight: 1800,
      maxWorldArea: 12000000,
      maxProps: 6,
      maxModelMeshes: 180,
    });
    for (const kind of ['statement', 'hero'] as const) {
      const input = boardFixture(kind);
      const result = compileStoryboardSpec(input.spec, input.words, {
        clipStart: 0,
        clipEnd: input.duration,
      });
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
      const spec = result.value.board;
      expect(result.value.sourceSpec).toEqual(input.spec);
      expect(spec.panels?.[0]).toMatchObject({ x: 0, y: 0, width: 1400, height: 820 });
      expect(spec.worldBounds).toEqual({ x: 0, y: 0, width: 1400, height: 820 });
      expect(spec.shots[0]).toEqual({
        at: result.value.startTime,
        dur: 0,
        x: 700,
        y: 410,
        zoom: 1.1,
      });
      expect(spec.panels?.[0].at).toBe(input.words[input.spec.panels[0].revealWord].start);
      expect(spec.businessPanels ?? []).toEqual([]);
      expect(() => assertStoryboardBudgets(spec)).not.toThrow();
      const oversized = { ...spec, worldBounds: { x: 0, y: 0, width: 8401, height: 1060 } };
      expect(() => assertStoryboardBudgets(oversized)).toThrow(/world bounds/);
    }
  });
});
