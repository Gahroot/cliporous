import { describe, expect, it } from 'vitest';
import { parseBusinessAlternatives } from '../../../../../ai/explainer/business-futures-contract';
import { parsePossibleFutures } from '../../../../../ai/explainer/kinds-concept-perspective';
import {
  businessAlternativeFixture,
  businessAlternativeFixtureContext,
} from './alternative-fixtures';
import { sampleBusinessAlternative } from './alternative-poses';
import {
  businessAlternativeFacts,
  businessAlternativePages,
  businessAlternativeReadingFits,
  businessAlternativeReadingStart,
  businessAlternativeStory,
  BUSINESS_ALTERNATIVE_READING as R,
} from './alternative-presentation';

function parsed(options: Parameters<typeof businessAlternativeFixture>[0] = {}) {
  const fixture = businessAlternativeFixture(options);
  const { visualMode: _mode, businessAlternatives: _lens, ...raw } = fixture.raw;
  const ctx = businessAlternativeFixtureContext(fixture);
  const scene = parsePossibleFutures(raw, ctx);
  if (!scene) throw new Error(ctx.issues.join('; '));
  const lens = parseBusinessAlternatives(fixture.raw, ctx, scene);
  if (!lens) throw new Error(ctx.issues.join('; '));
  return { fixture, scene, lens };
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
describe('OP-75 pure equal-area/time authored snapshots', () => {
  it.each([
    2, 3,
  ] as const)('%i alternatives: all 30fps, critical, handoff, repeated and reverse seeks preserve original facts', (count) => {
    const { scene, lens } = parsed({ count, mode: 'hybrid', condition: true });
    freeze(scene);
    freeze(lens);
    const before = JSON.stringify({ scene, lens });
    const facts = businessAlternativeFacts(scene, lens);
    const ready = businessAlternativeReadingStart(scene);
    const critical = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      ready,
      scene.checkAt,
      scene.resolveAt,
      12,
    ].flatMap((at) => [at - 1 / 30, at, at + 1 / 30]);
    const times = [...Array.from({ length: 361 }, (_, frame) => frame / 30), ...critical];
    const samples = times.map((t) => sampleBusinessAlternative(scene, lens, t));
    for (let slot = times.length - 1; slot >= 0; slot--) {
      const pose = sampleBusinessAlternative(scene, lens, times[slot]);
      expect(pose).toEqual(samples[slot]);
      expect(pose.facts).toEqual(facts);
      expect(new Set(pose.records.map((record) => record.area)).size).toBe(1);
      expect(new Set(pose.records.map((record) => record.opacity)).size).toBe(1);
      expect(new Set(pose.records.map((record) => record.scale)).size).toBe(1);
      expect(pose.records.map((record) => record.id)).toEqual(
        lens.records.map((record) => record.identity.id),
      );
      expect(
        [
          pose.open,
          pose.modelOpacity,
          pose.diagramOpacity,
          ...pose.records.flatMap((record) => [record.area, record.opacity, record.scale]),
        ].every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
      ).toBe(true);
      const lineIds = pose.page.cards.flatMap((card) => card.lines.map((line) => line.id));
      expect(new Set(lineIds).size).toBe(lineIds.length);
    }
    expect(sampleBusinessAlternative(scene, lens, scene.resolveAt)).toEqual(
      sampleBusinessAlternative(scene, lens, 12),
    );
    expect(sampleBusinessAlternative(scene, lens, Number.NaN)).toEqual(
      sampleBusinessAlternative(scene, lens, scene.setupAt),
    );
    expect(JSON.stringify({ scene, lens })).toBe(before);
    const story = businessAlternativeStory(scene, lens);
    expect(story.resolveAt).toBe(scene.resolveAt);
    expect(story.condition).toBe(scene.condition);
    expect(story.outcome).toBe(scene.outcome);
  });
  it.each([
    { count: 3 as const },
    { count: 2 as const, maxLabels: true },
  ])('complete fixed 24px pages reserve >=1.5s after opaque handoff', (options) => {
    const { scene, lens } = parsed(options);
    expect(R.bodyFont).toBe(24);
    const pages = businessAlternativePages(scene, lens);
    expect(pages.length).toBeLessThanOrEqual(4);
    expect(pages[0].start).toBe(businessAlternativeReadingStart(scene));
    for (const page of pages) {
      expect(page.end - page.start).toBeGreaterThanOrEqual(1.5);
      expect(sampleBusinessAlternative(scene, lens, page.start).diagramOpacity).toBeCloseTo(1);
      expect(sampleBusinessAlternative(scene, lens, page.start + 0.75).page.id).toBe(page.id);
      for (const card of page.cards)
        expect(card.lines.map((line) => line.text).join(' ')).toBe(card.fact.text);
    }
    const cards = pages[pages.length - 1].cards.filter((card) => card.fact.kind === 'record');
    expect(cards).toHaveLength(scene.alternatives.length);
    expect(new Set(cards.map((card) => card.width * card.height)).size).toBe(1);
    expect(sampleBusinessAlternative(scene, lens, scene.resolveAt).page.id).toBe(
      'equal-alternatives',
    );
  });
  it('diagram/hybrid preserve identical facts and original clocks; unsupported lens fails closed', () => {
    const { scene, lens } = parsed();
    const hybrid = { ...lens, visualMode: 'hybrid' as const };
    expect(businessAlternativeFacts(scene, lens)).toEqual(businessAlternativeFacts(scene, hybrid));
    expect(sampleBusinessAlternative(scene, lens, 4)).toEqual(
      sampleBusinessAlternative(scene, hybrid, 4),
    );
    expect(businessAlternativeReadingFits(scene, { ...hybrid, native: null })).toBe(false);
    expect(() => sampleBusinessAlternative(scene, { ...hybrid, native: null }, 4)).toThrow();
  });
});
