import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import {
  EXPANSION_SECTION_PARTS,
  EXPANSION_UNFOLD_FACES,
  type ExpansionSectionUnfoldScene,
} from '../../remotion/compositions/explainer/expansion/geometry/section-unfold-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionSectionScan,
  parseExpansionSolidUnfold,
} from './expansion-geometry-section-unfold-contract';
import { temporalSourceFixtures } from './expansion-temporal-fixtures';
import { makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/geometry/section-unfold.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const fixtures = temporalSourceFixtures(packet.stories);
const MODES = ['diagram', 'hybrid'] as const;
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const amount = (numerator: number, denominator = 1) => ({
  kind: 'rational',
  value: { numerator, denominator },
});
function fixture(identity: string): ExpansionSourceFixture {
  const f = fixtures.find((f) => f.proposal.identity === identity);
  if (!f) throw new Error(`Missing ${identity}`);
  return f;
}
function parse(f: ExpansionSourceFixture, mode: string) {
  const ctx = makeParseContext([...f.words], f.window),
    raw = { ...f.proposal, visualMode: mode };
  return {
    scene:
      f.id === '57' ? parseExpansionSectionScan(raw, ctx) : parseExpansionSolidUnfold(raw, ctx),
    ctx,
  };
}
function positive(f: ExpansionSourceFixture): ExpansionSectionUnfoldScene {
  const before = structuredClone(f),
    diagram = parse(f, 'diagram'),
    hybrid = parse(f, 'hybrid');
  expect(diagram.ctx.issues).toEqual([]);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(diagram.scene).not.toBeNull();
  expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  expect(f).toEqual(before);
  if (!diagram.scene) throw new Error('Expected real source-grounded geometry');
  return diagram.scene;
}
function negative(f: ExpansionSourceFixture) {
  for (const mode of MODES) {
    const before = structuredClone(f),
      result = parse(f, mode);
    expect(result.scene).toBeNull();
    expect(result.ctx.issues.length).toBeGreaterThan(0);
    expect(f).toEqual(before);
  }
}
interface Edit {
  path: (string | number)[];
  value?: unknown;
  remove?: boolean;
}
function authored(
  identity: string,
  edits: Edit[],
  clauses: Record<string, string> = {},
): ExpansionSourceFixture {
  const raw = packet.stories.find((f: { proposal: Rec }) => f.proposal.identity === identity);
  const base = temporalSourceFixtures([
      { ...raw, negatives: [{ name: 'authored boundary', edits, clauses }] },
    ])[0],
    changed = base.negatives[0];
  return { ...base, ...changed, proposal: changed.proposal, negatives: [] };
}
function withoutBeats(scene: ExpansionSectionUnfoldScene) {
  return Object.fromEntries(Object.entries(scene).filter(([key]) => !TIMES.some((t) => t === key)));
}
function retainedFact(parsed: unknown, raw: unknown) {
  const supplied = { ...(raw as Rec) };
  delete supplied.actor;
  delete supplied.links;
  if ('partId' in (parsed as Rec)) delete supplied.part;
  expect(parsed).toMatchObject(supplied);
}

it('persists four independent full positives and 64 explicit negatives with no authorized derivations', () => {
  expect(packet.version).toBe(1);
  expect(packet.pack).toBe('geometry');
  expect(fixtures).toHaveLength(4);
  expect(fixtures.reduce((n, f) => n + f.negatives.length, 0)).toBe(64);
  for (const id of ['57', '58'] as const) expect(expansionStory(id).allowedDerivations).toEqual([]);
  expect(fixture('Device').sourceText).not.toBe(fixture('Home').sourceText);
  expect(fixture('Cube').sourceText).not.toBe(fixture('Net').sourceText);
});
for (const f of fixtures)
  describe(`${f.id}/${String(f.proposal.identity)}`, () => {
    it('preserves exact identity/source/fact/status/domain/time parity and stable parser IDs in BOTH modes', () => {
      const scene = positive(f);
      expect(positive(f)).toEqual(scene);
      expect(scene.identity).toBe(f.proposal.identity);
      expect(scene.scope).toBe(f.proposal.scope);
      expect(scene.period).toBe(f.proposal.period);
      expect(scene.actors.map((a) => [a.label, a.evidence])).toEqual(
        (f.proposal.actors as Rec[]).map((a) => [a.label, a.evidence]),
      );
      expect(scene.actors.map((a) => a.id)).toEqual(
        scene.actors.map((_, i) => expansionEntityId(f.id, i)),
      );
      expect(scene.measurement).toMatchObject(f.proposal.measurement as Rec);
      expect(scene.result.id).toBe(`expansion-${f.id}-result`);
      retainedFact(scene.result, f.proposal.result);
      expect(scene.result.actorId).toBe(
        scene.actors.find((a) => a.label === (f.proposal.result as Rec).actor)?.id,
      );
      if (scene.storyId === '57') {
        for (const [i, part] of scene.parts.entries()) {
          expect(part.id).toBe(`expansion-57-part-${i}`);
          retainedFact(part, (f.proposal.parts as Rec[])[i]);
          expect(EXPANSION_SECTION_PARTS[scene.template].some((p) => p === part.part)).toBe(true);
        }
        retainedFact(scene.section, f.proposal.section);
        expect(scene.section.id).toBe('expansion-57-section');
        expect(scene.section.partId).toBe(
          scene.parts.find((part) => part.part === (f.proposal.section as Rec).part)?.id,
        );
        expect(scene.result.partId).toBe(scene.section.partId);
      } else {
        expect(scene.faces.map((face) => face.face)).toEqual(EXPANSION_UNFOLD_FACES);
        expect(scene.faces.map((face) => face.id)).toEqual(
          EXPANSION_UNFOLD_FACES.map((_, i) => `expansion-58-face-${i}`),
        );
        retainedFact(scene.unfolding, f.proposal.unfolding);
        retainedFact(scene.correspondence, f.proposal.correspondence);
        expect(scene.links).toHaveLength(6);
        for (const [i, link] of scene.links.entries()) {
          expect(link).toEqual({
            id: `expansion-58-link-${i}`,
            fromId: scene.faces[i].id,
            toId: scene.faces[i].id,
            role: 'correspondence',
            evidence: scene.correspondence.evidence,
          });
        }
      }
      expect(scene).not.toHaveProperty('area');
      expect(scene).not.toHaveProperty('volume');
      expect(scene).not.toHaveProperty('dimensions');
      expect(JSON.stringify(scene)).not.toContain('"derived"');
      const speech = expansionFixtureSpeech(
        f.sourceText.split(/(?<=[.!?;])\s+/u),
        f.window.endTime - f.window.startTime,
      );
      expect(new Set(BEATS.map((b) => f.proposal[b])).size).toBe(5);
      for (const [i, beat] of BEATS.entries()) {
        expect(speech.spans.some((s) => s.fromWord === f.proposal[beat])).toBe(true);
        if (i) {
          expect(scene[TIMES[i]]).toBe(f.words[f.proposal[beat] as number].start);
          expect(scene[TIMES[i]] - scene[TIMES[i - 1]]).toBeGreaterThanOrEqual(1 - 1e-6);
        }
      }
      expect(f.window.endTime - f.window.startTime).toBeGreaterThanOrEqual(5);
      expect(f.window.endTime - f.window.startTime).toBeLessThanOrEqual(12);
      expect(f.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(f.words[0].start - f.window.startTime).toBeCloseTo(0.25, 9);
      expect(f.window.endTime - f.words[f.words.length - 1].end).toBeCloseTo(0.35, 9);
      for (const [i, w] of f.words.entries()) {
        expect(Number.isFinite(w.start) && Number.isFinite(w.end)).toBe(true);
        expect(w.end).toBeGreaterThan(w.start);
        expect(w.start).toBeGreaterThanOrEqual(f.window.startTime);
        expect(w.end).toBeLessThanOrEqual(f.window.endTime);
        if (i) expect(w.start).toBeGreaterThanOrEqual(f.words[i - 1].end - 1e-7);
      }
    });
    it('rebases ONLY animation/source time, never measurement or face/part correspondence', () => {
      const original = positive(f),
        shifted = positive({
          ...f,
          words: f.words.map((w) => ({ ...w, start: w.start + 101, end: w.end + 101 })),
          window: {
            ...f.window,
            startTime: f.window.startTime + 101,
            endTime: f.window.endTime + 101,
          },
        });
      expect(withoutBeats(shifted)).toEqual(withoutBeats(original));
      for (const t of TIMES) expect(shifted[t]).toBeCloseTo(original[t] + 101, 8);
    });
    for (const bad of f.negatives)
      for (const mode of MODES)
        it(`rejects ${bad.name} in ${mode} with explicit diagnostics`, () => {
          const changed = { ...f, ...bad, proposal: bad.proposal },
            rawmode = changed.proposal.visualMode,
            selected = rawmode === 'diagram' || rawmode === 'hybrid' ? mode : String(rawmode),
            before = structuredClone(changed),
            result = parse(changed, selected);
          expect(result.scene).toBeNull();
          expect(result.ctx.issues.length).toBeGreaterThan(0);
          expect(changed).toEqual(before);
        });
  });
it('retains hidden vs unknown, conditional section/result, supplied measures and qualified schematic examples', () => {
  const known = positive(fixture('Device')),
    unknown = positive(fixture('Home')),
    solid = positive(fixture('Cube')),
    teaching = positive(fixture('Net'));
  if (
    known.storyId !== '57' ||
    unknown.storyId !== '57' ||
    solid.storyId !== '58' ||
    teaching.storyId !== '58'
  )
    throw new Error('Expected authored routes');
  expect(known.parts[0]).toMatchObject({ state: 'known', value: 'hidden' });
  expect(known.section).toMatchObject({ state: 'known', value: 'intersects' });
  expect(known.parts[0]).not.toHaveProperty('absent');
  expect(known.measurement).toMatchObject({
    state: 'known',
    amount: { kind: 'rational', value: { numerator: 2, denominator: 1 }, notation: '2' },
    basis: { unit: 'centimetre' },
  });
  expect(unknown.parts[0]).toMatchObject({ state: 'unknown', qualifier: 'unknown' });
  expect(unknown.parts[0]).not.toHaveProperty('value');
  expect(unknown.measurement).not.toHaveProperty('amount');
  expect(unknown.section).toMatchObject({
    state: 'conditional',
    value: 'intersects',
    condition: 'If access opens',
  });
  expect(unknown.result).toMatchObject({
    state: 'conditional',
    value: 'unresolved',
    condition: 'If access opens',
  });
  expect(solid.measurement).toMatchObject({
    amount: { kind: 'rational', value: { numerator: 2, denominator: 1 } },
    basis: { unit: 'metre' },
  });
  expect(teaching.measurement).toMatchObject({
    state: 'simulated',
    qualifier: 'simulated sample',
    amount: { value: { numerator: 3, denominator: 2 } },
    basis: { unit: 'centimetre' },
  });
  expect(teaching.unfolding).toMatchObject({
    state: 'illustrative',
    qualifier: 'illustrative example',
  });
  expect(teaching.correspondence).toMatchObject({
    state: 'illustrative',
    qualifier: 'illustrative example',
  });
});
it('does not infer reveal or absence from a supplied section relation', () => {
  const scene = positive(
    authored(
      'Device',
      [
        { path: ['result', 'value'], value: 'unresolved' },
        { path: ['outcome'], value: 'unresolved' },
      ],
      { 4: 'Ada states Device result is unresolved for Harbor during May.' },
    ),
  );
  if (scene.storyId !== '57') throw new Error('Expected section');
  expect(scene.section).toMatchObject({ state: 'known', value: 'intersects' });
  expect(scene.parts[0]).toMatchObject({ state: 'known', value: 'hidden' });
  expect(scene.result).toMatchObject({ state: 'known', value: 'unresolved' });
});
const STATES = [
  'known',
  'conditional',
  'simulated',
  'illustrative',
  'unknown',
  'missing',
  'disputed',
] as const;
for (const role of ['visibility', 'section'] as const)
  for (const state of STATES)
    it(`retains ${role} ${state} without choosing a disputed outcome or inventing absence`, () => {
      const path: (string | number)[] = role === 'visibility' ? ['parts', 0] : ['section'];
      const edits: Edit[] = [
        { path: [...path, 'state'], value: state },
        { path: ['result', 'value'], value: 'unresolved' },
        { path: ['outcome'], value: 'unresolved' },
      ];
      const source: Record<string, string> = {
        4: 'Ada states Device result is unresolved for Harbor during May.',
      };
      const values = role === 'visibility' ? ['hidden', 'absent'] : ['intersects', 'misses'];
      let predicate =
        role === 'visibility' ? `board visibility is ${values[0]}` : `section ${values[0]} board`;
      if (state === 'conditional')
        edits.push({ path: [...path, 'condition'], value: 'If access opens' });
      if (['simulated', 'illustrative', 'unknown', 'missing', 'disputed'].includes(state))
        edits.push({
          path: [...path, 'qualifier'],
          value:
            state === 'simulated'
              ? 'simulated sample'
              : state === 'illustrative'
                ? 'illustrative example'
                : state,
        });
      if (state === 'unknown' || state === 'missing' || state === 'disputed') {
        edits.push({ path: [...path, 'value'], remove: true });
        predicate = `${role === 'visibility' ? 'board visibility' : 'section for board'} is ${state === 'disputed' ? `disputed between ${values[0]} and ${values[1]}` : state}`;
      }
      if (state === 'disputed') edits.push({ path: [...path, 'alternatives'], value: values });
      let clause = `Ada states Device ${predicate} for Harbor during May.`;
      if (state === 'conditional') clause = `If access opens, ${clause}`;
      if (state === 'simulated' || state === 'illustrative')
        clause = `In this ${state === 'simulated' ? 'simulated sample' : 'illustrative example'}, ${clause}`;
      source[role === 'visibility' ? '1' : '2'] = clause;
      const prepared = authored('Device', edits, source),
        scene = positive(prepared);
      if (scene.storyId !== '57') throw new Error('Expected section');
      const fact = role === 'visibility' ? scene.parts[0] : scene.section;
      expect(fact.state).toBe(state);
      if (state === 'unknown' || state === 'missing') {
        expect(fact).not.toHaveProperty('value');
        expect(fact).toMatchObject({ qualifier: state });
      } else if (state === 'disputed') {
        expect(fact).not.toHaveProperty('value');
        expect(fact).toMatchObject({ qualifier: 'disputed', alternatives: values });
      } else
        expect(fact).toMatchObject({
          value: values[0],
          ...(state === 'conditional' ? { condition: 'If access opens' } : {}),
        });
      expect(scene.result).toMatchObject({ state: 'known', value: 'unresolved' });
      expect(scene.measurement).toEqual({
        ...positive(fixture('Device')).measurement,
        evidence: (prepared.proposal.measurement as Rec).evidence,
      });
    });
for (const state of ['unknown', 'missing', 'disputed'] as const)
  it(`retains cube correspondence ${state} without fabricating face links`, () => {
    const edits: Edit[] = [
      { path: ['correspondence', 'state'], value: state },
      { path: ['correspondence', 'qualifier'], value: state },
      { path: ['correspondence', 'value'], remove: true },
      { path: ['correspondence', 'links'], remove: true },
      { path: ['result', 'value'], value: 'unresolved' },
      { path: ['outcome'], value: 'unresolved' },
    ];
    if (state === 'disputed')
      edits.push({ path: ['correspondence', 'alternatives'], value: ['matched', 'unresolved'] });
    const scene = positive(
      authored('Cube', edits, {
        3: `Ada states Cube correspondence is ${state === 'disputed' ? 'disputed between matched and unresolved' : state} for Harbor during May.`,
        4: 'Ada states Cube result is unresolved for Harbor during May.',
      }),
    );
    if (scene.storyId !== '58') throw new Error('Expected unfold');
    expect(scene.correspondence.state).toBe(state);
    expect(scene.correspondence).not.toHaveProperty('value');
    expect(scene.links).toEqual([]);
    expect(scene.faces.map((f) => f.face)).toEqual(EXPANSION_UNFOLD_FACES);
    if (state === 'disputed')
      expect(scene.correspondence).toMatchObject({ alternatives: ['matched', 'unresolved'] });
  });
for (const state of ['unknown', 'missing', 'disputed'] as const)
  it(`retains supplied measurement ${state}, with no zero or inferred dimensions`, () => {
    const edits: Edit[] = [
      { path: ['measurement', 'state'], value: state },
      { path: ['measurement', 'qualifier'], value: state },
      { path: ['measurement', 'amount'], remove: true },
    ];
    if (state === 'disputed')
      edits.push({ path: ['measurement', 'alternatives'], value: [amount(2), amount(3)] });
    const scene = positive(
      authored('Device', edits, {
        3: `Ada Device board width is ${state === 'disputed' ? 'disputed between 2 and 3' : state} centimetres during May among Harbor.`,
      }),
    );
    expect(scene.measurement.state).toBe(state);
    expect(scene.measurement).not.toHaveProperty('amount');
    expect(scene).not.toHaveProperty('dimensions');
    if (state === 'disputed')
      expect(scene.measurement).toMatchObject({
        alternatives: [
          { value: { numerator: 2, denominator: 1 } },
          { value: { numerator: 3, denominator: 1 } },
        ],
      });
  });
it('keeps absent separate from hidden and rejects intersecting or revealing a source-absent part', () => {
  const edits: Edit[] = [
    { path: ['parts', 0, 'value'], value: 'absent' },
    { path: ['section', 'value'], value: 'misses' },
    { path: ['result', 'value'], value: 'not-revealed' },
    { path: ['outcome'], value: 'not-revealed' },
  ];
  const source = {
    1: 'Ada states Device board visibility is absent for Harbor during May.',
    2: 'Ada states Device section misses board for Harbor during May.',
    4: 'Ada states Device result is not-revealed for Harbor during May.',
  };
  const f = authored('Device', edits, source),
    scene = positive(f);
  if (scene.storyId !== '57') throw new Error('Expected section');
  expect(scene.parts[0]).toMatchObject({ state: 'known', value: 'absent' });
  expect(scene.section).toMatchObject({ value: 'misses' });
  negative(
    authored(
      'Device',
      edits.map((e) => (e.path.join('.') === 'section.value' ? { ...e, value: 'intersects' } : e)),
      { ...source, 2: 'Ada states Device section intersects board for Harbor during May.' },
    ),
  );
  negative(
    authored(
      'Device',
      edits.map((e) =>
        e.path.join('.') === 'result.value'
          ? { ...e, value: 'revealed' }
          : e.path.join('.') === 'outcome'
            ? { ...e, value: 'revealed' }
            : e,
      ),
      { ...source, 4: 'Ada states Device result is revealed for Harbor during May.' },
    ),
  );
});
it('keeps authored face IDs stable when the supplied complete face/link lists are reordered', () => {
  const baseline = positive(fixture('Cube'));
  const reordered = positive(
    authored('Cube', [
      { path: ['faces'], value: [...EXPANSION_UNFOLD_FACES].reverse() },
      {
        path: ['correspondence', 'links'],
        value: [...EXPANSION_UNFOLD_FACES].reverse().map((face) => ({ from: face, to: face })),
      },
    ]),
  );
  expect(reordered).toEqual(baseline);
});
it('retains explicit measured zero, rejects negative measured lengths and never computes geometry', () => {
  const scene = positive(
    authored('Device', [{ path: ['measurement', 'amount'], value: amount(0) }], {
      3: 'Ada Device board width is 0 centimetres during May among Harbor.',
    }),
  );
  expect(scene.measurement).toMatchObject({ amount: { value: { numerator: 0, denominator: 1 } } });
  expect(scene).not.toHaveProperty('area');
  expect(scene).not.toHaveProperty('volume');
  negative(
    authored('Device', [{ path: ['measurement', 'amount'], value: amount(-2) }], {
      3: 'Ada Device board width is -2 centimetres during May among Harbor.',
    }),
  );
});
for (const f of fixtures)
  it(`${String(f.proposal.identity)} rejects extra geometry, code and malformed word/window timing`, () => {
    for (const [key, value] of Object.entries({
      id: 'caller',
      svg: '<svg/>',
      html: '<b/>',
      url: 'https://example.com',
      file: '/tmp/mesh',
      vertices: [[0, 0, 0]],
      mesh: 'freeform',
      camera: {},
      evaluate: 'x=>x',
      treatment: 'time-loom',
      volume: 99,
    }))
      negative({ ...f, proposal: { ...f.proposal, [key]: value } });
    for (const start of [NaN, Infinity, -Infinity]) {
      const words = structuredClone([...f.words]);
      words[0].start = start;
      negative({ ...f, words });
    }
    const words = structuredClone([...f.words]);
    words[0].end = words[0].start;
    negative({ ...f, words });
    for (const endTime of [4.9, 12.1]) negative({ ...f, window: { ...f.window, endTime } });
  });
