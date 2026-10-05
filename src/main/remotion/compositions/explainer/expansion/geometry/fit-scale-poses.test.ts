import { expect, it } from 'vitest';
import {
  parseExpansionLinkedScale,
  parseExpansionPackingClearance,
} from '../../../../../ai/explainer/expansion-geometry-fit-scale-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { fitScalePages, fitScalePose } from './fit-scale-poses';
import {
  accepted,
  linkedFixture,
  maximumPacking,
  packet,
  qualifiedResult,
} from './fit-scale-test-fixtures';

it('accepted maximum 12 facts and 9 unique candidates reach every page at authored 30fps', () => {
  const scene = accepted(maximumPacking());
  expect(scene.records.length + scene.dimensions.length + 1).toBe(12);
  expect(scene.relations.length).toBe(9);
  expect(
    new Set(Array.from({ length: 360 }, (_, i) => fitScalePose(scene, i / 30).page)).size,
  ).toBe(fitScalePages(scene).length);
});
it('signed near-limit clearance is an exact source label, never a verdict or projection input', () => {
  const source = structuredClone(packet.stories[0]);
  const dimension = (source.proposal.dimensions as Rec[])[2];
  const q = dimension.quantity as Rec;
  const span = q.evidence as { fromWord: number; toWord: number };
  const w = source.words.slice(span.fromWord, span.toWord + 1).find((w) => w.text === 'unknown');
  if (!w) throw new Error('Missing authored unknown word');
  w.text = '-999999999/1000000000';
  q.state = 'known';
  delete q.qualifier;
  q.amount = { kind: 'rational', value: { numerator: -999999999, denominator: 1000000000 } };
  const scene = accepted(source);
  expect(scene.result).toEqual(accepted(packet.stories[0]).result);
  expect(fitScalePose(scene, 6).blockY).toBe(fitScalePose(accepted(packet.stories[0]), 6).blockY);
  expect(
    fitScalePages(scene)
      .flatMap((p) => p.lines)
      .join(''),
  ).toContain('-999999999/1000000000');
});
it('measured versus schematic retain exact identity, dimensions, units and basis without geometry inference', () => {
  const measured = accepted(linkedFixture('measured')),
    schematic = accepted(linkedFixture('schematic'));
  // Different setup wording shifts source indexes by two words, not source facts.
  const facts = (value: unknown) =>
    JSON.stringify(value, (key, v) => (key === 'evidence' ? undefined : v));
  expect(facts(measured.dimensions)).toBe(facts(schematic.dimensions));
  expect(facts(measured.records)).toBe(facts(schematic.records));
  expect(facts(measured.result)).toBe(facts(schematic.result));
  const quoted = (representation: 'measured' | 'schematic') => {
    const source = linkedFixture(representation),
      scene = accepted(source);
    return scene.dimensions.map((d) =>
      source.words
        .slice(d.quantity.evidence.fromWord, d.quantity.evidence.toWord + 1)
        .map((w) => w.text)
        .join(' '),
    );
  };
  expect(quoted('measured')).toEqual(quoted('schematic'));
  const quantities = measured.dimensions.map((d) => d.quantity);
  expect(quantities.map((q) => q.basis.unit)).toEqual(['metre', 'centimetre', 'millimetre']);
  for (const q of quantities) {
    expect(q.basis.period).toBe('Trial');
    expect(q.basis.population).toBe('Bench');
  }
  const q = quantities[0];
  if (!('amount' in q) || q.amount.kind !== 'rational') throw new Error('Exact rational required');
  expect(q.amount.value).toEqual({ numerator: 999999999, denominator: 1000000000 });
  expect(
    fitScalePages(measured)
      .flatMap((p) => p.lines)
      .join(''),
  ).toContain('999999999/1000000000');
  const unresolved = accepted(linkedFixture('measured', true));
  expect(unresolved.records[0].state).toBe('conditional');
  expect(unresolved.result.state).toBe('unknown');
});
for (const [index, source] of [
  maximumPacking(),
  linkedFixture('measured'),
  linkedFixture('schematic'),
  linkedFixture('measured', true),
  ...(['unknown', 'missing', 'disputed'] as const).flatMap((s) => [
    qualifiedResult('59', s),
    qualifiedResult('60', s),
  ]),
].entries())
  it(`expanded pure 30fps shuffled/repeated/nonfinite/final-hold proof ${index}`, () => {
    const scene = accepted(source),
      before = JSON.stringify(scene),
      pages = fitScalePages(scene);
    const poses = Array.from({ length: 361 }, (_, i) => fitScalePose(scene, i / 30));
    for (let i = 360; i >= 0; i--) {
      expect(fitScalePose(scene, i / 30)).toEqual(poses[i]);
      expect(fitScalePose(scene, i / 30)).toEqual(poses[i]);
    }
    for (const t of [NaN, Infinity, -Infinity]) expect(fitScalePose(scene, t)).toEqual(poses[0]);
    expect(new Set(poses.map((p) => p.page)).size).toBe(pages.length);
    expect(fitScalePose(scene, 12)).toEqual(fitScalePose(scene, 1000));
    expect(new Set(pages.flatMap((p) => p.lineIds)).size).toBe(
      pages.reduce((n, p) => n + p.lines.length, 0),
    );
    expect(JSON.stringify(scene)).toBe(before);
    expect(accepted(source, 'hybrid').dimensions).toEqual(scene.dimensions);
  });
for (const story of packet.stories) {
  it(`source ${story.id}: accepted, immutable, all frames/repeated/shuffled/nonfinite/final holds`, () => {
    for (const source of [story, ...story.paraphrases]) {
      const scene = accepted(source);
      const before = JSON.stringify(scene);
      const poses = Array.from({ length: 300 }, (_, i) => fitScalePose(scene, i / 30));
      for (let i = 299; i >= 0; i--) expect(fitScalePose(scene, i / 30)).toEqual(poses[i]);
      const pages = fitScalePages(scene);
      expect(new Set(poses.map((p) => p.page)).size).toBe(pages.length);
      for (const time of [NaN, Infinity, -Infinity])
        expect(fitScalePose(scene, time)).toEqual(fitScalePose(scene, 0));
      expect(fitScalePose(scene, 10)).toEqual(fitScalePose(scene, 1000));
      expect(JSON.stringify(scene)).toBe(before);
      expect(accepted(source, 'hybrid').records).toEqual(scene.records);
    }
  });
  for (const negative of story.negatives)
    it(`${story.id} rejects ${negative.name}`, () => {
      const raw = structuredClone(story.proposal);
      const window = structuredClone(story.window);
      for (const e of negative.edits) {
        let node: Rec = e.path[0] === 'window' ? (window as unknown as Rec) : raw;
        const path = e.path[0] === 'window' ? e.path.slice(1) : e.path;
        for (const key of path.slice(0, -1)) node = node[key] as Rec;
        const key = path[path.length - 1];
        if (e.remove) delete node[key];
        else node[key] = e.value;
      }
      const ctx = makeParseContext(story.words, window);
      expect(
        (story.id === '59' ? parseExpansionPackingClearance : parseExpansionLinkedScale)(raw, ctx),
      ).toBeNull();
    });
}
