import { describe, expect, it } from 'vitest';
import { isLongformSourceSpec } from '../../../shared/longform-scenes';
import { STORYBOARD_MODELS, STORYBOARD_PANEL_KINDS } from '../../../shared/storyboards';
import { validateSceneFirstLongformPlan } from '../longform-scene-contract';
import { compileStoryboardSpec } from './compiler';
import { parseStoryboardSpec } from './contract';
import { boardFixture, multiPanelFixture, savedBoardFixture, sourceLabel } from './fixtures';

const parse = (f: ReturnType<typeof boardFixture>, raw: unknown = f.spec) =>
  parseStoryboardSpec(raw, f.words, { clipStart: 0, clipEnd: f.duration });
function rejected(f: ReturnType<typeof boardFixture>, code: string, raw: unknown = f.spec) {
  const result = parse(f, raw);
  expect(result.ok, JSON.stringify(result)).toBe(false);
  if (!result.ok) expect(result.diagnostics.some((d) => d.code === code)).toBe(true);
}

describe('strict storyboard source boundary', () => {
  it.each(STORYBOARD_PANEL_KINDS)('raw JSON %s → parse → save → authoritative compile', (kind) => {
    const f = boardFixture(kind);
    expect(parse(f, JSON.parse(JSON.stringify(f.spec))).ok).toBe(true);
    const plan = savedBoardFixture(f);
    const result = validateSceneFirstLongformPlan(
      JSON.parse(JSON.stringify(plan)),
      f.words,
      f.duration,
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const scene = result.value.scenes[0];
    expect(scene.kind).toBe('storyboard');
    if (scene.kind === 'storyboard') {
      expect(scene.board.boardIn?.at).toBe(plan.scenes[0].startTime);
      expect(scene.board.elements.every((e) => e.at >= 17)).toBe(true);
      expect(scene.cues.every((c) => c.at >= 17)).toBe(true);
    }
  });
  it.each(
    STORYBOARD_MODELS,
  )('supports only authored %s reveal and source-backed activation', (model) => {
    for (const action of ['reveal', 'activate'] as const) {
      const f = boardFixture('hero', model, action);
      const result = compileStoryboardSpec(f.spec, f.words, { clipStart: 0, clipEnd: f.duration });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (result.ok)
        expect(result.value.board.props[0]).toMatchObject({ model, action, semanticId: 'object' });
    }
  });
  it.each(['battery', 'lightbulb'] as const)('grounds %s deactivation', (model) => {
    expect(parse(boardFixture('hero', model, 'deactivate')).ok).toBe(true);
  });
  it.each([
    'x',
    'geometry',
    'code',
    'url',
    'svg',
    'style',
    'camera',
    'font',
  ])('rejects arbitrary %s at the spec and nested panel', (field) => {
    const f = boardFixture();
    rejected(f, 'shape', { ...f.spec, [field]: 'https://invalid.example' });
    rejected(f, 'shape', { ...f.spec, panels: [{ ...f.spec.panels[0], [field]: 10 }] });
  });
  it('rejects nonfinite, deep, cyclic, oversized and accessor-bearing inputs without executing them', () => {
    const f = boardFixture();
    for (const value of [NaN, Infinity, -Infinity]) rejected(f, 'budget', { ...f.spec, value });
    let deep: unknown = 0;
    for (let i = 0; i < 20; i++) deep = { deep };
    rejected(f, 'budget', { ...f.spec, deep });
    const cyclic: Record<string, unknown> = { ...f.spec };
    cyclic.self = cyclic;
    rejected(f, 'budget', cyclic);
    rejected(f, 'budget', { ...f.spec, subject: { ...f.spec.subject, text: 'x'.repeat(100_000) } });
    const getter = Object.defineProperty({}, 'kind', {
      get: () => {
        throw new Error('executed');
      },
      enumerable: true,
    });
    rejected(f, 'budget', getter);
  });
  it('rejects ungrounded/unsafe labels and unsupported models/actions', () => {
    const f = boardFixture('hero');
    const p = f.spec.panels[0];
    rejected(f, 'evidence', { ...f.spec, subject: { ...f.spec.subject, text: 'invented' } });
    for (const bad of ['<script>', 'https://x', '`code`'])
      rejected(f, 'evidence', { ...f.spec, subject: { ...f.spec.subject, text: bad } });
    for (const prop of [
      { ...p.prop, model: 'rocket' },
      { ...p.prop, action: 'fly' },
    ])
      rejected(f, 'unsupported', { ...f.spec, panels: [{ ...p, prop }] });
    const laptop = boardFixture('hero', 'laptop');
    rejected(laptop, 'unsupported', {
      ...laptop.spec,
      panels: [
        { ...laptop.spec.panels[0], prop: { ...laptop.spec.panels[0].prop, action: 'deactivate' } },
      ],
    });
  });
  it('rejects invented exact quantities, wrong units, approximations and conditional claims', () => {
    const f = boardFixture('quantity');
    rejected(f, 'evidence', { ...f.spec, panels: [{ ...f.spec.panels[0], value: 13 }] });
    rejected(f, 'evidence', {
      ...f.spec,
      panels: [{ ...f.spec.panels[0], unit: sourceLabel(f.words, 'System') }],
    });
    for (const qualifier of ['about', 'if']) {
      const changed = structuredClone(f);
      changed.words[2].text = qualifier;
      rejected(changed, 'evidence');
    }
  });
  it('requires local forward relationship evidence rather than reversible/conditional arrows', () => {
    const f = boardFixture('process');
    for (const marker of ['and', 'after', 'because', 'unless']) {
      const bad = structuredClone(f);
      bad.words[2].text = marker;
      bad.words[4].text = marker;
      bad.words[6].text = marker;
      rejected(bad, 'evidence');
    }
    rejected(f, 'evidence', {
      ...f.spec,
      panels: [{ ...f.spec.panels[0], relationship: 'causes' }],
    });
    const cause = structuredClone(f);
    cause.words[2].text = 'causes';
    cause.words[4].text = 'causes';
    cause.words[6].text = 'causes';
    expect(
      parse(cause, { ...cause.spec, panels: [{ ...cause.spec.panels[0], relationship: 'causes' }] })
        .ok,
    ).toBe(true);
    const cmp = boardFixture('comparison');
    cmp.words[3].text = 'and';
    rejected(cmp, 'evidence');
  });
  it('does not bind another actor’s action or conditional/negated prop direction', () => {
    for (const words of ['drains but laptop charges', 'might charges', 'never charges']) {
      const f = boardFixture('hero', 'battery', 'activate');
      // Caption is kept grounded; the action evidence is not.
      f.words[2].text = words;
      const p = f.spec.panels[0];
      if (p.kind !== 'hero') throw new Error('fixture');
      p.caption = sourceLabel(f.words, 'battery');
      rejected(f, 'evidence');
    }
  });
  it('rejects word/window/beat order and insufficient reading/action/overview holds', () => {
    const f = boardFixture();
    rejected(f, 'words', { ...f.spec, endWord: 999 });
    rejected(f, 'words', { ...f.spec, startWord: -1 });
    rejected(f, 'timing', {
      ...f.spec,
      panels: [{ ...f.spec.panels[0], moveWord: 2, revealWord: 3 }],
    });
    const fast = structuredClone(f);
    fast.words = fast.words.map((w, i) => ({ ...w, start: 17 + i * 0.1, end: 17.05 + i * 0.1 }));
    rejected(fast, 'timing');
    const late = boardFixture('hero', 'battery', 'activate');
    const prop = late.spec.panels[0].prop;
    if (prop) prop.atWord = late.spec.endWord;
    rejected(late, 'timing');
    rejected(f, 'timing', { ...f.spec, overview: { atWord: f.spec.endWord } });
    expect(
      parseStoryboardSpec(f.spec, f.words, {
        clipStart: 0,
        clipEnd: f.duration,
        section: { id: 'cut', startWord: 0, endWord: 3 },
      }).ok,
    ).toBe(false);
  });
  it('checks duplicate panel IDs and repeated semantic model/evidence identity', () => {
    const f = multiPanelFixture(2);
    f.spec.panels[1].id = f.spec.panels[0].id;
    rejected(f, 'identity');
    f.spec.panels[1].id = 'different';
    const a = f.spec.panels[0].prop;
    const b = f.spec.panels[1].prop;
    if (!a || !b) throw new Error('fixture');
    b.id = a.id;
    rejected(f, 'identity');
    b.evidence = { ...a.evidence };
    expect(parse(f).ok).toBe(true);
    f.spec.panels[1].startWord = 0;
    rejected(f, 'words');
  });
  it('requires explanatory continuity but permits an evidenced repeated prop without repeating the subject', () => {
    const f = multiPanelFixture(2);
    const second = f.spec.panels[1];
    f.words[second.startWord].text = 'Unrelated';
    second.title = sourceLabel(f.words, 'Unrelated notes');
    rejected(f, 'evidence');
    const a = f.spec.panels[0].prop;
    if (!a || !second.prop) throw new Error('fixture');
    second.prop.id = a.id;
    second.prop.evidence = { ...a.evidence };
    expect(parse(f).ok).toBe(true);
  });
  it('rejects panel and cumulative authored mesh budgets', () => {
    const f = multiPanelFixture();
    rejected(f, 'budget', { ...f.spec, panels: [...f.spec.panels, f.spec.panels[0]] });
    for (const panel of f.spec.panels) {
      if (!panel.prop) throw new Error('fixture');
      f.words[panel.prop.evidence.startWord].text = 'book';
      panel.prop.model = 'book';
    }
    rejected(f, 'budget');
  });
  it('separates source spec, parser and plan versions; verifies metadata even on omitted boards', () => {
    const f = boardFixture();
    rejected(f, 'version', { ...f.spec, specVersion: 999 });
    for (const mutation of [
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.parserVersion = 1;
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        delete p.storyboardStyle;
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.scenes[0].presentation = 'speaker-side';
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.scenes[0].id = 'forged';
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.scenes[0].startTime += 0.1;
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.scenes[0].endWord--;
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.sourceFingerprint = 'forged';
      },
      (p: ReturnType<typeof savedBoardFixture>) => {
        p.sections[0].endWord = 3;
      },
    ]) {
      const plan = savedBoardFixture(f);
      mutation(plan);
      plan.scenes[0].omitted = true;
      expect(validateSceneFirstLongformPlan(plan, f.words, f.duration).ok).toBe(false);
    }
    const valid = savedBoardFixture(f);
    valid.scenes[0].omitted = true;
    const result = validateSceneFirstLongformPlan(valid, f.words, f.duration);
    expect(result.ok && result.value.scenes).toEqual([]);
    expect(isLongformSourceSpec(f.spec)).toBe(true);
  });
});
