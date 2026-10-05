import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPT_FIXTURE_PADDING } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import type { ExpansionMatrixMatchingScene } from '../../remotion/compositions/explainer/expansion/relationships/matrix-matching-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionCapacityMatch,
  parseExpansionMatrixLinks,
} from './expansion-relationships-matrix-matching-contract';
import { isRec, makeParseContext, type Rec, type SceneWindow } from './kind-spec';

type Positive = Pick<ExpansionSourceFixture, 'sourceText' | 'words' | 'window' | 'proposal'> & {
  readonly name?: string;
};
interface Fixture extends ExpansionSourceFixture {
  readonly id: '37' | '38';
  readonly paraphrases: readonly Positive[];
  readonly variants: readonly Positive[];
}
const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/relationships/matrix-matching.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: Fixture[] };
const modes = ['diagram', 'hybrid'] as const;
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected a raw fixture record');
  return value;
}
function list(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected raw fixture records');
  return value.map(rec);
}
function fixture(id: '37' | '38'): Fixture {
  const found = packet.stories.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
}
function parse(
  id: '37' | '38',
  source: Positive,
  mode: (typeof modes)[number],
  proposal = source.proposal,
  words = source.words,
  window = source.window,
) {
  const ctx = makeParseContext(words, window);
  // Keep genuinely invalid modes invalid instead of accidentally repairing the negative proposal.
  const visualMode =
    proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid'
      ? mode
      : proposal.visualMode;
  const raw = { ...proposal, visualMode };
  return {
    scene:
      id === '37' ? parseExpansionMatrixLinks(raw, ctx) : parseExpansionCapacityMatch(raw, ctx),
    issues: ctx.issues,
  };
}
function accepted(
  id: '37' | '38',
  source: Positive,
  mode: (typeof modes)[number],
): ExpansionMatrixMatchingScene {
  const result = parse(id, source, mode);
  expect(result.scene, result.issues.join('; ')).not.toBeNull();
  if (!result.scene) throw new Error(result.issues.join('; '));
  return result.scene;
}
function allPositives(f: Fixture): Positive[] {
  return [f, ...f.paraphrases, ...f.variants];
}
function sourceClause(source: Positive, span: ExpansionEvidenceSpan): string {
  return source.words
    .slice(span.fromWord, span.toWord + 1)
    .map((word) => word.text)
    .join(' ');
}
function clauses(source: Positive): string[] {
  const result: string[] = [];
  let current: string[] = [];
  for (const word of source.words) {
    current.push(word.text);
    if (/[.!?;]$/.test(word.text)) {
      result.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) throw new Error('Incomplete fixture clause');
  return result;
}

describe('local relationships source packet, stories 37–38', () => {
  it('freezes the version, routes and empty numeric derivation whitelists', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('relationships');
    expect(packet.stories.map((entry) => entry.id)).toEqual(['37', '38']);
    expect(expansionStory('37').allowedDerivations).toEqual([]);
    expect(expansionStory('38').allowedDerivations).toEqual([]);
    for (const f of packet.stories) {
      expect(f.paraphrases.length).toBeGreaterThan(0);
      expect(f.negatives.length).toBeGreaterThan(50);
      for (const paraphrase of f.paraphrases) {
        expect(paraphrase.sourceText).not.toBe(f.sourceText);
        expect(clauses(paraphrase).every((clause, index) => clause !== clauses(f)[index])).toBe(
          true,
        );
      }
    }
  });
  for (const f of packet.stories) {
    for (const positive of allPositives(f)) {
      const name = positive.name ?? 'canonical';
      for (const mode of modes) {
        it(`${f.id} ${name}: accepts source-owned facts in ${mode}`, () => {
          const scene = accepted(f.id, positive, mode);
          expect(scene.storyId).toBe(f.id);
          expect(scene.visualMode).toBe(mode);
          expect(scene.entities.map((entity) => entity.label)).toEqual(
            list(positive.proposal.entities).map((entry) => entry.label),
          );
          expect(new Set(Object.values(scene.sourceSpans).map((span) => span.fromWord)).size).toBe(
            5,
          );
          expect(scene.resolveAt).toBeLessThanOrEqual(positive.window.endTime - 0.8 + 1e-6);
          for (const [index, phase] of phases.entries()) {
            const word = positive.words[positive.proposal[`${phase}Word`] as number];
            expect(scene[`${phase}At`]).toBe(
              index === 0
                ? Math.max(positive.window.startTime + 0.3, word?.start ?? 0)
                : word?.start,
            );
            const previous = phases[index - 1];
            if (previous)
              expect(scene[`${phase}At`] - scene[`${previous}At`]).toBeGreaterThanOrEqual(1 - 1e-6);
            expect(/[.!?;]$/.test(sourceClause(positive, scene.sourceSpans[phase]))).toBe(true);
          }
          const serialized = JSON.stringify(scene);
          expect(serialized).not.toContain('"derived"');
          for (const field of [
            'result',
            'operation',
            'assignment',
            'residualCapacity',
            'score',
            'coordinates',
            'template',
          ])
            expect(scene).not.toHaveProperty(field);
        });
      }
      it(`${f.id} ${name}: exact fact/state/time/ID parity across modes`, () => {
        const diagram = accepted(f.id, positive, 'diagram');
        const hybrid = accepted(f.id, positive, 'hybrid');
        expect({ ...hybrid, visualMode: 'diagram' }).toEqual(diagram);
      });
      it(`${f.id} ${name}: uses production speech padding, not relaxed timing`, () => {
        const speech = expansionFixtureSpeech(
          clauses(positive),
          positive.window.endTime - positive.window.startTime,
        );
        expect(positive.sourceText).toBe(positive.words.map((word) => word.text).join(' '));
        expect(positive.words).toEqual(speech.words);
        expect(positive.words[0]?.start).toBe(CONCEPT_FIXTURE_PADDING.leadInSec);
        expect(positive.words.at(-1)?.end).toBe(
          positive.window.endTime - CONCEPT_FIXTURE_PADDING.tailSec,
        );
        expect(positive.window.endTime - positive.window.startTime).toBeGreaterThanOrEqual(5);
        expect(positive.window.endTime - positive.window.startTime).toBeLessThanOrEqual(12);
      });
    }
    for (const negative of f.negatives) {
      for (const mode of modes) {
        it(`${f.id} rejects ${negative.name} (${mode})`, () => {
          const source: Positive = {
            sourceText: negative.sourceText ?? f.sourceText,
            words: negative.words ?? f.words,
            window: negative.window ?? f.window,
            proposal: negative.proposal,
          };
          const parsed = parse(f.id, source, mode);
          expect(parsed.scene, `${negative.name}: ${parsed.issues.join('; ')}`).toBeNull();
        });
      }
    }
  }
});

describe('semantic retention and contradiction-only validation', () => {
  for (const mode of modes) {
    it(`matrix sparse cells are not zero, false, negative, reversed or transitive (${mode})`, () => {
      const scene = accepted('37', fixture('37'), mode);
      if (scene.storyId !== '37') throw new Error('Wrong local route');
      expect(scene.relations).toHaveLength(3);
      expect(scene.matrix).toEqual({
        rowIds: scene.entities.map((entity) => entity.id),
        columnIds: scene.entities.map((entity) => entity.id),
        unrecordedCellMeaning: 'not-supplied',
      });
      expect(scene.graph.entityIds).toEqual(scene.entities.map((entity) => entity.id));
      expect(scene.graph.relationIds).toEqual(scene.relations.map((relation) => relation.id));
      expect(scene.matrix).not.toHaveProperty('cells');
      expect(scene.relations.map((relation) => relation.state)).toEqual([
        'known',
        'known',
        'unknown',
      ]);
      expect(scene.relations[2]).toMatchObject({
        role: 'transfer',
        state: 'unknown',
        qualifier: 'unknown',
      });
      for (const relation of scene.relations) {
        expect(relation).not.toHaveProperty('value');
        expect(relation).not.toHaveProperty('status');
      }
      expect(
        scene.relations.filter(
          (relation) =>
            relation.fromId === scene.entities[0]?.id &&
            relation.toId === scene.entities[2]?.id &&
            relation.role === 'dependency',
        ),
      ).toEqual([]);
      expect(
        scene.relations.filter(
          (relation) =>
            relation.fromId === scene.entities[2]?.id && relation.toId === scene.entities[1]?.id,
        ),
      ).toEqual([]);
    });
    it(`capacity/matches retain supplied statuses and exact operands, not invented assignment (${mode})`, () => {
      const scene = accepted('38', fixture('38'), mode);
      if (scene.storyId !== '38') throw new Error('Wrong local route');
      expect(scene.records).toHaveLength(4);
      expect(scene.eligibility[1]).toMatchObject({ state: 'unknown', qualifier: 'unknown' });
      expect(scene.eligibility[1]).not.toHaveProperty('status');
      const matches = scene.records.filter((record) => record.type === 'match');
      expect(matches.map((record) => record.status)).toEqual(['matched', 'unresolved']);
      expect(matches[1]).not.toHaveProperty('destinationId');
      expect(matches[1]).toMatchObject({ state: 'unknown', qualifier: 'unresolved' });
      const capacities = scene.records.filter((record) => record.type === 'capacity');
      for (const record of capacities)
        expect(record.quantity).toMatchObject({
          state: 'known',
          claim: 'capacity',
          basis: {
            unit: 'count',
            period: 'May',
            population: 'placements',
            denominator: { numerator: 2, denominator: 1 },
          },
          amount: { kind: 'rational', value: { numerator: 1, denominator: 1 }, notation: '1' },
        });
    });
    it(`retains every explicit state and qualifier without promoting it (${mode})`, () => {
      for (const f of packet.stories) {
        for (const positive of f.variants) {
          const scene = accepted(f.id, positive, mode);
          if (scene.storyId === '37') {
            for (const [index, relation] of scene.relations.entries()) {
              const raw = list(positive.proposal.relations)[index];
              expect(relation.state).toBe(raw?.state);
              if ('qualifier' in relation) expect(relation.qualifier).toBe(raw?.qualifier);
              if ('condition' in relation) expect(relation.condition).toBe(raw?.condition);
            }
          } else {
            for (const [index, record] of scene.records.entries()) {
              const raw = list(positive.proposal.records)[index];
              if (record.type === 'capacity') {
                const quantity = rec(raw?.quantity);
                expect(record.quantity.state).toBe(quantity.state);
                expect(record.quantity.basis).toEqual(quantity.basis);
                if ('amount' in record.quantity)
                  expect(record.quantity.amount).toMatchObject(rec(quantity.amount));
                if ('alternatives' in record.quantity)
                  expect(record.quantity.alternatives).toMatchObject(list(quantity.alternatives));
              } else {
                expect(record.state).toBe(raw?.state);
                expect(record.status).toBe(raw?.status);
                if ('condition' in record) expect(record.condition).toBe(raw?.condition);
                if ('qualifier' in record) expect(record.qualifier).toBe(raw?.qualifier);
              }
            }
            for (const [index, record] of scene.eligibility.entries()) {
              const raw = list(positive.proposal.eligibility)[index];
              expect(record.state).toBe(raw?.state);
              expect(record.status).toBe(raw?.status);
            }
          }
        }
      }
    });
    it(`source-supplied match does not imply unknown eligibility was eligible or denied (${mode})`, () => {
      const f = fixture('38');
      const source = f.variants.find(
        (entry) => entry.name === 'supplied-match-with-unknown-eligibility',
      );
      if (!source) throw new Error('Missing independently supplied status fixture');
      const scene = accepted('38', source, mode);
      if (scene.storyId !== '38') throw new Error('Wrong local route');
      expect(scene.eligibility[0].state).toBe('unknown');
      expect(scene.eligibility[0]).not.toHaveProperty('status');
      expect(scene.records[2]).toMatchObject({
        state: 'known',
        status: 'matched',
        destinationId: scene.destinationIds[0],
      });
    });
    it(`rejects explicit eligible-match endpoints that exceed numeric capacity (${mode})`, () => {
      const f = fixture('38');
      const source = f.negatives.find((entry) => entry.name === 'capacity-conflict-two-matches');
      if (!source) throw new Error('Missing source conflict fixture');
      const result = parse('38', { ...f, ...source }, mode);
      expect(result.scene).toBeNull();
      expect(result.issues.join(' ')).toContain('capacity');
    });
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const field of ['numerator', 'denominator'] as const) {
        it(`rejects nonfinite amount/basis ${field} ${String(value)} (${mode})`, () => {
          const f = fixture('38');
          for (const place of ['amount', 'basis'] as const) {
            const proposal = structuredClone(f.proposal);
            const quantity = rec(list(proposal.records)[0]?.quantity);
            rec(place === 'amount' ? rec(quantity.amount).value : rec(quantity.basis).denominator)[
              field
            ] = value;
            expect(parse('38', f, mode, proposal).scene).toBeNull();
          }
        });
      }
    }
    it(`rejects nonfinite/overlapping/outside source timing (${mode})`, () => {
      for (const f of packet.stories) {
        for (const value of [NaN, Infinity, -Infinity]) {
          const words = structuredClone(f.words);
          const index = f.proposal.actionWord as number;
          const word = words[index];
          if (!word) throw new Error('Missing action word');
          word.start = value;
          expect(parse(f.id, f, mode, f.proposal, words).scene).toBeNull();
        }
        const words = structuredClone(f.words);
        const word = words[1];
        if (!word) throw new Error('Missing source word');
        word.start = words[0]?.start ?? 0;
        expect(parse(f.id, f, mode, f.proposal, words).scene).toBeNull();
      }
    });
    it(`IDs survive source label edits, source facts are not SVG names (${mode})`, () => {
      for (const f of packet.stories) {
        const from = f.id === '37' ? 'Aster' : 'Ada';
        const to = f.id === '37' ? 'Aster:West' : 'Ada:West';
        const edited = JSON.parse(JSON.stringify(f).replaceAll(from, to)) as Fixture;
        const before = accepted(f.id, f, mode),
          after = accepted(f.id, edited, mode);
        expect(after.entities.map((entity) => entity.id)).toEqual(
          before.entities.map((entity) => entity.id),
        );
        expect(JSON.stringify(after.entities.map((entity) => entity.id))).not.toContain(to);
        if (before.storyId === '37' && after.storyId === '37')
          expect(after.relations.map((relation) => relation.id)).toEqual(
            before.relations.map((relation) => relation.id),
          );
        if (before.storyId === '38' && after.storyId === '38')
          expect(after.records.map((record) => record.id)).toEqual(
            before.records.map((record) => record.id),
          );
      }
    });
    it(`retains absolute production times on a shifted window (${mode})`, () => {
      for (const f of packet.stories) {
        const offset = 20;
        const words = f.words.map((word) => ({
          ...word,
          start: word.start + offset,
          end: word.end + offset,
        }));
        const win: SceneWindow = {
          ...f.window,
          startTime: f.window.startTime + offset,
          endTime: f.window.endTime + offset,
        };
        const shifted = parse(f.id, f, mode, f.proposal, words, win).scene;
        const original = accepted(f.id, f, mode);
        expect(shifted).not.toBeNull();
        for (const phase of phases)
          expect(shifted?.[`${phase}At`]).toBeCloseTo(original[`${phase}At`] + offset, 8);
      }
    });
    it(`rejects unrecognized nested geometry, URLs, IDs and evaluators (${mode})`, () => {
      for (const f of packet.stories) {
        for (const field of ['id', 'template', 'url', 'html', 'position', 'evaluate', 'mode']) {
          const proposal = structuredClone(f.proposal);
          const target =
            f.id === '37' ? list(proposal.relations)[0] : rec(list(proposal.records)[0]?.quantity);
          if (!target) throw new Error('Missing record');
          target[field] = field === 'position' ? [0, 0] : '<arbitrary>';
          expect(parse(f.id, f, mode, proposal).scene).toBeNull();
        }
      }
    });
  }
});
