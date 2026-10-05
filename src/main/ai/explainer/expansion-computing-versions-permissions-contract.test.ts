import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseExpansionReplicaMerge,
  parseExpansionSoftwareScope,
} from './expansion-computing-versions-permissions-contract';
import { type TemporalFixtureSeed, temporalSourceFixtures } from './expansion-temporal-fixtures';
import { isRec, makeParseContext } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/computing/versions-permissions.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: TemporalFixtureSeed[];
  positiveExamples: (NonNullable<TemporalFixtureSeed['negatives']>[number] & {
    id: '69' | '70';
    state: 'unknown' | 'missing' | 'disputed' | 'conditional' | 'simulated' | 'illustrative';
  })[];
};
const fixtures = temporalSourceFixtures(packet.stories);
const times = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'];
describe('STEP16 source-only versions and permissions', () => {
  it('retains the complete version1 computing packet', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('computing');
    expect(fixtures.map((f) => f.id)).toEqual(['69', '69', '70', '70']);
  });
  it('rejects array-shaped modes, evidence and domain labels without string coercion', () => {
    for (const fixture of fixtures) {
      const parser = fixture.id === '69' ? parseExpansionReplicaMerge : parseExpansionSoftwareScope;
      for (const field of ['visualMode', 'evidence']) {
        const ctx = makeParseContext(fixture.words, fixture.window);
        expect(parser({ ...fixture.proposal, [field]: [fixture.proposal[field]] }, ctx)).toBeNull();
        expect(ctx.issues.length).toBeGreaterThan(0);
      }
      for (const field of fixture.id === '70'
        ? ['scope', 'period', 'operation']
        : ['scope', 'period']) {
        const proposal = structuredClone(fixture.proposal);
        if (!Array.isArray(proposal.records) || !isRec(proposal.records[0]))
          throw new Error('Missing authored record');
        proposal.records[0][field] = [proposal.records[0][field]];
        const ctx = makeParseContext(fixture.words, fixture.window);
        expect(parser(proposal, ctx)).toBeNull();
        expect(ctx.issues.length).toBeGreaterThan(0);
      }
    }
  });
  it('authors all six distinct qualification states for each route', () => {
    for (const id of ['69', '70']) {
      expect(packet.positiveExamples.filter((e) => e.id === id).map((e) => e.state)).toEqual([
        'unknown',
        'missing',
        'disputed',
        'conditional',
        'simulated',
        'illustrative',
      ]);
    }
  });
  for (const example of packet.positiveExamples) {
    const base = packet.stories.find((s) => s.id === example.id);
    if (!base) throw new Error('Positive example must reference a complete authored source');
    // Reuse the existing complete-source patch materializer, not a clause-only fixture helper.
    // Its negative carrier is only an authoring API: these resulting raw objects are positives.
    const [materialized] = temporalSourceFixtures([
      { ...base, paraphrases: [], negatives: [example] },
    ]);
    const raw = materialized.negatives[0];
    const words = raw.words;
    const window = raw.window;
    if (!words || !window || !raw.sourceText)
      throw new Error('Positive must retain complete speech');
    const parser = example.id === '69' ? parseExpansionReplicaMerge : parseExpansionSoftwareScope;
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      it(`${example.id} ${visualMode} accepts authored ${example.name} without qualification promotion`, () => {
        const ctx = makeParseContext(words, window);
        const scene = parser({ ...raw.proposal, visualMode }, ctx);
        expect(scene, JSON.stringify(ctx.issues)).not.toBeNull();
        expect(ctx.issues).toEqual([]);
        if (!scene) return;
        const facts = [...scene.records, ...scene.relations];
        expect(facts.some((f) => f.status.state === example.state)).toBe(true);
        expect(scene.outcome).toBe(raw.proposal.outcome);
        expect(scene.relations[1].status.state).toBe(example.state);
        for (const group of ['records', 'relations'] as const) {
          const authored = raw.proposal[group];
          if (!Array.isArray(authored) || !authored.every(isRec))
            throw new Error('Missing raw facts');
          for (const [index, fact] of scene[group].entries()) {
            const proposal = authored[index];
            expect(fact.status.state).toBe(proposal.state);
            expect(fact.result).toBe(proposal.result);
            expect(fact.evidence).toEqual(proposal.evidence);
            expect(fact.scope).toBe(proposal.scope);
            expect(fact.period).toBe(proposal.period);
            const clause = words
              .slice(fact.evidence.fromWord, fact.evidence.toWord + 1)
              .map((w) => w.text)
              .join(' ');
            expect(clause).toContain(fact.result);
            if ('qualification' in fact.status) {
              expect(fact.status.qualification).toBe(proposal.qualification);
              expect(clause).toContain(fact.status.qualification);
            }
            if ('condition' in fact.status && fact.status.condition) {
              expect(fact.status.condition).toBe(proposal.condition);
              expect(clause).toContain(fact.status.condition);
            }
          }
        }
        if (['unknown', 'missing', 'disputed'].includes(example.state) && example.id === '69') {
          expect(scene.records[0].version).toBeUndefined();
        }
        if (example.state === 'simulated' || example.state === 'illustrative') {
          expect(scene.evidence).toBe('illustrative');
          expect(
            facts.every((f) => f.status.state === example.state || f.status.state === 'unknown'),
          ).toBe(true);
          const promoted = structuredClone(raw.proposal);
          if (!Array.isArray(promoted.relations) || !isRec(promoted.relations[1]))
            throw new Error('Missing final fact');
          promoted.relations[1].state = 'known';
          delete promoted.relations[1].qualification;
          const review = makeParseContext(words, window);
          expect(parser({ ...promoted, visualMode }, review)).toBeNull();
          expect(review.issues.length).toBeGreaterThan(0);
        }
        const other = parser(
          { ...raw.proposal, visualMode: visualMode === 'diagram' ? 'hybrid' : 'diagram' },
          makeParseContext(words, window),
        );
        expect({ ...other, visualMode }).toEqual(scene);
      });
    }
  }
  for (const [index, f] of fixtures.entries())
    for (const visualMode of ['diagram', 'hybrid']) {
      const parser = f.id === '69' ? parseExpansionReplicaMerge : parseExpansionSoftwareScope;
      it(`${index} ${f.id} ${visualMode} accepts complete raw facts and rebases only animation`, () => {
        const ctx = makeParseContext(f.words, f.window);
        const scene = parser({ ...f.proposal, visualMode }, ctx);
        expect(scene, JSON.stringify(ctx.issues)).not.toBeNull();
        expect(ctx.issues).toEqual([]);
        if (!scene) return;
        const other = parser(
          { ...f.proposal, visualMode: visualMode === 'diagram' ? 'hybrid' : 'diagram' },
          makeParseContext(f.words, f.window),
        );
        expect({ ...other, visualMode }).toEqual(scene);
        const shifted = parser(
          { ...f.proposal, visualMode },
          makeParseContext(
            f.words.map((w) => ({ ...w, start: w.start + 100, end: w.end + 100 })),
            { ...f.window, startTime: f.window.startTime + 100, endTime: f.window.endTime + 100 },
          ),
        );
        expect(shifted).not.toBeNull();
        const normalized = { ...shifted };
        for (const field of times) {
          expect((shifted as unknown as Record<string, number>)[field]).toBeCloseTo(
            (scene as unknown as Record<string, number>)[field] + 100,
          );
          delete (normalized as Record<string, unknown>)[field];
        }
        const domain = { ...scene };
        for (const field of times) delete (domain as Record<string, unknown>)[field];
        expect(normalized).toEqual(domain);
        expect(scene.entities.map((e) => e.id)).toEqual(
          scene.entities.map((_, i) => `expansion-${f.id}-entity-${i}`),
        );
      });
      for (const n of f.negatives)
        it(`${index} ${visualMode} rejects ${n.name} with review diagnostics`, () => {
          const ctx = makeParseContext(n.words ?? f.words, n.window ?? f.window);
          expect(parser({ ...n.proposal, visualMode }, ctx)).toBeNull();
          expect(ctx.issues.length).toBeGreaterThan(0);
        });
      it(`${index} rejects unsupported mode without overriding it`, () => {
        const ctx = makeParseContext(f.words, f.window);
        expect(parser({ ...f.proposal, visualMode: 'webgl' }, ctx)).toBeNull();
        expect(ctx.issues.length).toBeGreaterThan(0);
      });
    }
});
