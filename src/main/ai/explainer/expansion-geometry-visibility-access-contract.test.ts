import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionVisibilityAccessScene } from '../../remotion/compositions/explainer/expansion/geometry/visibility-access-types';
import type { ExpansionSourceFixture } from './expansion-fixture-words';
import {
  parseExpansionReachability,
  parseExpansionViewpointOcclusion,
} from './expansion-geometry-visibility-access-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/geometry/visibility-access.source.json',
    'utf8',
  ),
) as { version: number; pack: string; stories: TemporalFixtureSeed[] };
const fixtures = temporalSourceFixtures(packet.stories);
const modes = ['diagram', 'hybrid'] as const;
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected fact record');
  return value;
}
function rows(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected fact array');
  return value.map(rec);
}
function fixture(id: '61' | '62'): ExpansionSourceFixture {
  const f = fixtures.find((entry) => entry.id === id);
  if (!f) throw new Error('Missing source');
  return f;
}
function parse(f: ExpansionSourceFixture, mode: (typeof modes)[number], raw = f.proposal) {
  const ctx = makeParseContext(f.words, f.window);
  const proposal = {
    ...raw,
    visualMode: modes.some((value) => value === raw.visualMode) ? mode : raw.visualMode,
  };
  return {
    scene:
      f.id === '61'
        ? parseExpansionViewpointOcclusion(proposal, ctx)
        : parseExpansionReachability(proposal, ctx),
    issues: ctx.issues,
  };
}
function accept(
  f: ExpansionSourceFixture,
  mode: (typeof modes)[number],
): ExpansionVisibilityAccessScene {
  const { scene, issues } = parse(f, mode);
  expect(scene, issues.join('; ')).not.toBeNull();
  expect(issues).toEqual([]);
  if (!scene) throw new Error(issues.join('; '));
  return scene;
}
function clauses(f: ExpansionSourceFixture): string[] {
  return f.sourceText.split(/(?<=[.!?])\s+/);
}
function rewrite(
  f: ExpansionSourceFixture,
  texts: readonly string[],
  proposal = f.proposal,
): ExpansionSourceFixture {
  const result = temporalSourceFixtures([
    {
      ...f,
      proposal,
      negatives: [],
      paraphrases: [
        {
          name: 'explicit authored test source',
          clauses: texts,
          outcome: String(proposal.outcome),
        },
      ],
    },
  ])[1];
  if (!result) throw new Error('Missing rewritten source');
  return result;
}
function factRows(raw: Rec): Rec[] {
  return [...rows(raw.records), ...rows(raw.relations)];
}
function predicate(raw: Rec, fact: Rec, value: string): string {
  return fact.role === 'existence'
    ? `${fact.actor} reports ${fact.target} existence as ${value} at ${fact.scope} during ${fact.period}.`
    : fact.role === 'visibility' || fact.role === 'occlusion'
      ? `${fact.actor} reports ${fact.target} ${fact.role} as ${value} by ${fact.occluder} from ${raw.viewpoint} viewpoint at ${fact.scope} during ${fact.period}.`
      : `${fact.actor} reports ${fact.role} on ${fact.route} from ${fact.from} to ${fact.to} as ${value} at ${fact.scope} during ${fact.period}.`;
}
function stateVariant(
  f: ExpansionSourceFixture,
  index: number,
  state: string,
): ExpansionSourceFixture {
  const raw = structuredClone(f.proposal),
    facts = factRows(raw),
    texts = clauses(f),
    fact = facts[index];
  // Remove the old source condition before authoring one new conditional clause.
  if (raw.condition) {
    delete raw.condition;
    delete facts[2].condition;
    facts[2].state = 'known';
    texts[3] = predicate(raw, facts[2], String(facts[2].value));
  }
  const value =
    typeof fact.value === 'string'
      ? fact.value
      : fact.role === 'permission'
        ? 'allowed'
        : 'reachable';
  delete fact.qualifier;
  delete fact.condition;
  delete fact.value;
  fact.state = state;
  if (['unknown', 'missing', 'disputed'].includes(state)) {
    fact.qualifier = state;
    texts[index + 1] = predicate(raw, fact, state);
  } else {
    fact.value = value;
    texts[index + 1] = predicate(raw, fact, value);
    if (state === 'conditional') {
      raw.condition = 'if the signal changes';
      fact.condition = raw.condition;
      texts[index + 1] = `If the signal changes, ${texts[index + 1]}`;
    }
    if (state === 'simulated' || state === 'illustrative') {
      raw.evidence = 'illustrative';
      fact.qualifier = state === 'simulated' ? 'simulation' : 'teaching example';
      texts[index + 1] = `In this ${fact.qualifier}, ${texts[index + 1]}`;
    }
  }
  return rewrite(f, texts, raw);
}
function noDerivations(scene: ExpansionVisibilityAccessScene) {
  const encoded = JSON.stringify(scene);
  for (const forbidden of [
    'derived',
    'result',
    'distance',
    'travelTime',
    'coordinates',
    'path',
    'camera',
    'mesh',
    'operation',
    'unit',
    'quantity',
  ])
    expect(encoded).not.toContain(`"${forbidden}"`);
  const domain = [...scene.records, ...scene.relations];
  domain.forEach((fact) => {
    expect(Object.keys(fact).some((name) => name === 'at' || name.endsWith('At'))).toBe(false);
  });
}
function reject(name: string, f: ExpansionSourceFixture, mutate: (raw: Rec) => void) {
  for (const mode of modes)
    it(`${f.id} rejects ${name} ${mode} with diagnostics`, () => {
      const raw = structuredClone(f.proposal);
      mutate(raw);
      const result = parse(f, mode, raw);
      expect(result.scene).toBeNull();
      expect(result.issues.length).toBeGreaterThan(0);
    });
}

describe('STEP15 source-only visibility and access', () => {
  it('complete raw version1 geometry positives, no catalog derivations', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('geometry');
    expect(fixtures).toHaveLength(4);
    for (const id of ['61', '62'] as const)
      expect(expansionStory(id).allowedDerivations).toEqual([]);
    for (const seed of packet.stories) {
      expect(seed.words.length).toBeGreaterThan(0);
      expect(seed.window).toBeDefined();
      expect(seed.proposal).toBeDefined();
    }
  });
  for (const [i, f] of fixtures.entries()) {
    for (const mode of modes)
      it(`${f.id} complete positive ${i} ${mode}`, () => {
        const scene = accept(f, mode);
        noDerivations(scene);
        expect(f.sourceText).toBe(f.words.map((word) => word.text).join(' '));
        expect(f.words[0].start).toBe(f.window.startTime + 0.25);
        expect(f.words.at(-1)?.end).toBe(f.window.endTime - 0.35);
        expect(f.window.endTime - f.window.startTime).toBeGreaterThanOrEqual(5);
        expect(f.window.endTime - f.window.startTime).toBeLessThanOrEqual(12);
        f.words.forEach((word, index) => {
          expect(Number.isFinite(word.start) && Number.isFinite(word.end)).toBe(true);
          expect(word.end).toBeGreaterThan(word.start);
          expect(word.start).toBeGreaterThanOrEqual(f.window.startTime);
          expect(word.end).toBeLessThanOrEqual(f.window.endTime);
          if (index) expect(word.start).toBeGreaterThanOrEqual(f.words[index - 1].end - 1e-7);
        });
        expect(new Set(Object.values(scene.sourceSpans).map((span) => span.fromWord)).size).toBe(5);
        phases.forEach((phase, index) => {
          const span = scene.sourceSpans[phase];
          expect(span.fromWord).toBe(f.proposal[`${phase}Word`]);
          expect(/[.!?]$/.test(f.words[span.toWord].text)).toBe(true);
          if (index)
            expect(scene[`${phase}At`] - scene[`${phases[index - 1]}At`]).toBeGreaterThanOrEqual(1);
        });
        expect(scene.resolveAt).toBeLessThanOrEqual(f.window.endTime - 0.8);
      });
    it(`${f.id} positive ${i} full mode/identity/source/domain/time parity`, () => {
      const scene = accept(f, 'diagram');
      expect(accept(f, 'hybrid')).toEqual({ ...scene, visualMode: 'hybrid' });
      expect(accept(f, 'diagram')).toEqual(scene);
      const ids = [...scene.entities, ...scene.records, ...scene.relations].map(
        (entry) => entry.id,
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => id.startsWith(`expansion-${f.id}-entity-`))).toBe(true);
      const shifted = {
        ...f,
        words: f.words.map((word) => ({ ...word, start: word.start + 4, end: word.end + 4 })),
        window: { ...f.window, startTime: f.window.startTime + 4, endTime: f.window.endTime + 4 },
      };
      expect(accept(shifted, 'diagram')).toEqual({
        ...scene,
        ...Object.fromEntries(phases.map((phase) => [`${phase}At`, scene[`${phase}At`] + 4])),
      });
    });
    for (const n of f.negatives)
      for (const mode of modes)
        it(`${f.id} raw negative ${n.name} ${mode} diagnoses`, () => {
          const result = parse(
            { ...f, words: n.words ?? f.words, window: n.window ?? f.window },
            mode,
            n.proposal,
          );
          expect(result.scene).toBeNull();
          expect(result.issues.length).toBeGreaterThan(0);
        });
  }
  for (const id of ['61', '62'] as const) {
    const f = fixture(id);
    it(`${id} independently worded paraphrase retains identical facts and IDs`, () => {
      const p = fixtures.filter((entry) => entry.id === id)[1];
      expect(p.sourceText).not.toBe(f.sourceText);
      expect(accept(p, 'diagram')).toEqual(accept(f, 'diagram'));
    });
    for (const [field, cap] of [
      ['entities', 8],
      ['records', 12],
      ['relations', 16],
    ] as const)
      reject(`${field} overflow`, f, (raw) => {
        raw[field] = Array.from({ length: cap + 1 }, () => structuredClone(rows(raw[field])[0]));
      });
    for (const field of [
      'svg',
      'html',
      'url',
      'file',
      'function',
      'geometry',
      'id',
      'treatment',
      'position',
      'resultAt',
    ])
      reject(`extra ${field}`, f, (raw) => {
        raw[field] = 'untrusted';
      });
    reject('empty records', f, (raw) => {
      raw.records = [];
    });
    reject('missing relation', f, (raw) => {
      raw.relations = [];
    });
    reject('duplicate record', f, (raw) => {
      raw.records = [...rows(raw.records), rows(raw.records)[0]];
    });
    reject('duplicate relation', f, (raw) => {
      raw.relations = [...rows(raw.relations), rows(raw.relations)[0]];
    });
    reject('oversized label', f, (raw) => {
      rows(raw.entities)[0].label = 'x'.repeat(29);
    });
    for (const mode of modes)
      it(`${id} invalid finite/positive/nonoverlap/window/hold/gap times ${mode}`, () => {
        for (const patch of [
          { start: Number.NaN },
          { end: Number.POSITIVE_INFINITY },
          { end: f.words[1].start },
          { start: f.words[0].end - 1e-6 },
          { start: -1 },
          { end: 13 },
        ]) {
          const words = f.words.map((word) => ({ ...word }));
          words[1] = { ...words[1], ...patch };
          const result = parse({ ...f, words }, mode);
          expect(result.scene).toBeNull();
          expect(result.issues.length).toBeGreaterThan(0);
        }
        for (const duration of [4.99, 12.01])
          expect(
            parse({ ...f, window: { ...f.window, endTime: duration } }, mode).scene,
          ).toBeNull();
        for (const phase of ['response', 'resolve'] as const) {
          const start = Number(f.proposal[`${phase}Word`]),
            end = phase === 'response' ? Number(f.proposal.checkWord) : f.words.length;
          const words = f.words.map((word, i) =>
            i >= start && i < end
              ? {
                  ...word,
                  start: word.start + (phase === 'resolve' ? 1.1 : -1.5),
                  end: word.end + (phase === 'resolve' ? 1.1 : -1.5),
                }
              : { ...word },
          );
          expect(parse({ ...f, words }, mode).scene).toBeNull();
        }
      });
    for (const index of [0, 1, 2])
      for (const state of [
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ])
        for (const mode of modes)
          it(`${id} fact ${index} retains ${state} ${mode}`, () => {
            const variant = stateVariant(f, index, state),
              scene = accept(variant, mode),
              fact = [...scene.records, ...scene.relations][index];
            expect(fact.state).toBe(state);
            noDerivations(scene);
            if (['unknown', 'missing', 'disputed'].includes(state)) {
              expect(fact).not.toHaveProperty('value');
              expect(fact).toHaveProperty('qualifier', state);
            }
            if (state === 'conditional')
              expect(fact).toHaveProperty('condition', 'if the signal changes');
            expect(accept(variant, mode === 'diagram' ? 'hybrid' : 'diagram')).toEqual({
              ...scene,
              visualMode: mode === 'diagram' ? 'hybrid' : 'diagram',
            });
          });
  }
  for (const mode of modes) {
    it(`61 hidden with unknown existence does not invent present ${mode}`, () => {
      const scene = accept(stateVariant(fixture('61'), 0, 'unknown'), mode);
      expect(scene.records[0]).not.toHaveProperty('value');
      expect(scene.records[1]).toHaveProperty('value', 'hidden');
    });
    it(`62 connection and conditional reachability do not grant unknown permission ${mode}`, () => {
      const scene = accept(fixture('62'), mode);
      expect(scene.records[0]).toHaveProperty('value', 'connected');
      expect(scene.records[1]).not.toHaveProperty('value');
      expect(scene.relations[0]).toHaveProperty('condition', 'if the gate opens');
    });
    it(`62 physical reachability is not permission ${mode}`, () => {
      const f = fixture('62'),
        raw = structuredClone(f.proposal),
        texts = clauses(f);
      rows(raw.records)[1].state = 'known';
      rows(raw.records)[1].value = 'denied';
      delete rows(raw.records)[1].qualifier;
      texts[2] = predicate(raw, rows(raw.records)[1], 'denied');
      const scene = accept(rewrite(f, texts, raw), mode);
      expect(scene.records[1]).toHaveProperty('value', 'denied');
      expect(scene.relations[0]).toHaveProperty('value', 'reachable');
    });
    it(`61 authored box/isometric selection never recalculates visibility ${mode}`, () => {
      const f = fixture('61'),
        raw = structuredClone(f.proposal);
      raw.template = 'robot-box';
      raw.viewpoint = 'isometric';
      for (const fact of factRows(raw).slice(1)) fact.viewpoint = 'isometric';
      const scene = accept(
        rewrite(
          f,
          clauses(f).map((text) => text.replaceAll('front', 'isometric')),
          raw,
        ),
        mode,
      );
      expect(scene.records[1]).toHaveProperty('value', 'hidden');
      expect(scene.relations[0]).toHaveProperty('value', 'blocked');
    });
    it(`62 authored courtyard selection never calculates geography ${mode}`, () => {
      const f = fixture('62');
      const scene = accept(
        { ...f, proposal: { ...f.proposal, template: 'courtyard-route' } },
        mode,
      );
      noDerivations(scene);
    });
  }
});
