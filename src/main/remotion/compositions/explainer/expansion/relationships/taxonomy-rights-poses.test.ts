import { describe, expect, it } from 'vitest';
import { compare } from '../value-logic';
import {
  relationshipJudgment,
  taxonomyRightsPages,
  taxonomyRightsPose,
} from './taxonomy-rights-poses';
import {
  parseTaxonomyRightsFixture,
  taxonomyRightsPacket,
  taxonomyRightsStressSeed,
  taxonomyRightsTestScenes,
} from './taxonomy-rights-test-fixtures';

const scenes = taxonomyRightsTestScenes();
describe('source-only taxonomy and separate rights seekable poses', () => {
  for (const [i, scene] of scenes.entries())
    it(`case ${i}: all beats, shuffled/repeated/nonfinite seeks and final hold`, () => {
      const pages = taxonomyRightsPages(scene);
      const times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        scene.resolveAt + 10,
        ...Array.from(
          { length: 91 },
          (_, i) => scene.setupAt + (i * (scene.resolveAt - scene.setupAt)) / 90,
        ),
      ];
      const expected = new Map(times.map((t) => [t, taxonomyRightsPose(scene, t)]));
      for (const t of [...times].reverse()) {
        const pose = taxonomyRightsPose(scene, t);
        expect(pose).toEqual(expected.get(t));
        expect(pose.pages).toEqual(pages);
        expect(pose.page).toBeGreaterThanOrEqual(0);
        expect(pose.page).toBeLessThan(pages.length);
        for (const value of [pose.reveal, pose.action, pose.response, pose.check, pose.resolve])
          expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true);
      }
      for (const t of [NaN, Infinity, -Infinity])
        expect(taxonomyRightsPose(scene, t)).toEqual(taxonomyRightsPose(scene, scene.setupAt));
      expect(taxonomyRightsPose(scene, scene.resolveAt + 100).page).toBe(pages.length - 1);
      expect(scene.relations.every((r) => pages.some((p) => p.id === r.id))).toBe(true);
      for (const e of scene.entities)
        expect(
          pages
            .filter((p) => p.id === e.id)
            .flatMap((p) => p.lines)
            .join(''),
        ).toContain(e.label);
      if (scene.storyId === '34')
        for (const r of scene.relations)
          if (
            r.share &&
            'amount' in r.share.quantity &&
            r.share.quantity.amount.kind === 'rational'
          ) {
            const denominator = r.share.quantity.basis.denominator;
            if (!denominator) throw new Error('Missing source denominator');
            const within = compare(r.share.quantity.amount.value, denominator);
            expect(within.ok && within.value <= 0).toBe(true);
          }
    });
  it('preserves unknown versus explicit exclusion and never adds transitive classification or control', () => {
    const taxonomy = scenes[0];
    const rights = scenes[1];
    if (taxonomy?.storyId !== '33' || rights?.storyId !== '34')
      throw new Error('Missing shipped stories');
    expect(taxonomy.relations).toHaveLength(3);
    expect(taxonomy.relations[2]?.state).toBe('unknown');
    expect(rights.relations.find((r) => r.right === 'control')?.state).toBe('unknown');
    expect(relationshipJudgment(taxonomy.relations[2])).toBe('unknown; unknown');
    for (const story of ['33', '34'] as const) {
      const scene = parseTaxonomyRightsFixture(
        taxonomyRightsStressSeed({ story, state: 'denied' }),
      );
      expect(scene.entities).toHaveLength(8);
      expect(scene.records).toHaveLength(8);
      expect(scene.relations).toHaveLength(16);
      expect(
        scene.relations.every(
          (r) => 'status' in r && r.status === (story === '33' ? 'excluded' : 'denied'),
        ),
      ).toBe(true);
    }
  });
  it('retains exact supplied quantity state, operands, basis and qualifiers; zero is not unknown', () => {
    for (const scene of scenes) {
      if (scene.storyId !== '34') continue;
      const pages = taxonomyRightsPages(scene);
      for (const r of scene.relations) {
        if (!r.share) continue;
        const q = r.share.quantity;
        const text = pages
          .filter((p) => p.id === r.id)
          .flatMap((p) => p.lines)
          .join('');
        expect(text).toContain(q.actor);
        expect(text).toContain(q.claim);
        expect(text).toContain(`State: ${q.state}`);
        expect(text).toContain(q.basis.population);
        expect(text).toContain(q.basis.period);
        if ('condition' in q) expect(text).toContain(q.condition);
        if ('qualifier' in q) expect(text).toContain(q.qualifier);
        if ('amount' in q && q.amount.kind === 'rational' && q.amount.value.numerator === 0) {
          expect(q.state).toBe('known');
          expect(text).toContain('Share: 0');
        }
      }
    }
    const money = taxonomyRightsStressSeed({ story: '34', state: 'known', unit: 'count' });
    const raw = money.proposal.relations;
    if (!Array.isArray(raw) || !raw[0]?.share?.quantity) throw new Error('Missing raw share');
    raw[0].share.quantity.basis.unit = 'USD';
    raw[0].share.denominatorUnit = 'USD';
    raw[0].share.quantity.amount = { kind: 'money', value: { currency: 'USD', minorUnits: 100 } };
    expect(() => parseTaxonomyRightsFixture(money)).toThrow();
  });
  it('runs shipped paraphrases and negative fixtures through the actual contract', () => {
    for (const seed of taxonomyRightsPacket.stories) {
      expect(parseTaxonomyRightsFixture(seed).storyId).toBe(seed.id);
      for (const paraphrase of seed.paraphrases)
        expect(parseTaxonomyRightsFixture(paraphrase).storyId).toBe(seed.id);
      for (const negative of seed.negatives)
        expect(() => parseTaxonomyRightsFixture({ ...seed, ...negative })).toThrow();
    }
  });
});
