import { describe, expect, it } from 'vitest';
import {
  parseExpansionEquivalence,
  parseExpansionUnitConversion,
} from '../../../../../ai/explainer/expansion-representations-units-equivalence-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import {
  unitsEquivalenceConversionCards,
  unitsEquivalenceDomain,
  unitsEquivalenceFields,
  unitsEquivalencePages,
  unitsEquivalencePose,
  unitsEquivalencePosition,
} from './units-equivalence-poses';
import {
  acceptedUnitsEquivalence,
  unitsEquivalenceCases,
  unitsEquivalencePacket,
  unitsEquivalenceSpeech,
} from './units-equivalence-test-fixtures';

describe('units/equivalence real parser and pure seekable poses', () => {
  it('accepts both modes, actual maximum actors/marks and preserves operands through shuffled/repeated seeks', () => {
    for (const scene of unitsEquivalenceCases()) {
      const before = JSON.stringify(scene);
      const times = [
        -10,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        100,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ];
      const forward = times.map((t) => unitsEquivalencePose(scene, t));
      for (const i of [8, 4, 1, 6, 0, 7, 2, 5, 3, 4]) {
        expect(unitsEquivalencePose(scene, times[i])).toEqual(forward[i]);
        const { pages: _, ...pose } = forward[i];
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      }
      expect(unitsEquivalencePose(scene, scene.resolveAt + 1)).toEqual(
        unitsEquivalencePose(scene, 100),
      );
      expect(unitsEquivalencePose(scene, 100).page).toBe(unitsEquivalencePages(scene).length - 1);
      expect(JSON.stringify(scene)).toBe(before);
      const original =
        scene.storyId === '49' ? [scene.record.quantity] : scene.records.map((r) => r.quantity);
      expect(scene.storyId === '49' ? [scene.result.operand] : scene.result.operands).toEqual(
        original,
      );
      const fields = unitsEquivalenceFields(scene);
      for (const { id, fields: copy } of fields) {
        expect(
          unitsEquivalencePages(scene)
            .filter((p) => p.id === id)
            .flatMap((p) => p.lines)
            .join(''),
        ).toBe(copy.join(''));
      }
    }
  });
  it('shows approved numeric conversion cards and source-backed equivalent views', () => {
    const conversion = acceptedUnitsEquivalence(unitsEquivalencePacket.stories[0]);
    const cards = unitsEquivalenceConversionCards(
      conversion,
      unitsEquivalencePose(conversion, conversion.setupAt),
    );
    expect(cards.map((c) => c.lines.join(''))).toEqual([
      '1.5metreknown',
      '150/1centimetrederivedknown',
    ]);
    const equivalent = acceptedUnitsEquivalence(unitsEquivalencePacket.stories[2]);
    if (equivalent.storyId !== '50' || equivalent.result.state !== 'derived')
      throw new Error('Expected exact ratio');
    expect(equivalent.result.ratio).toEqual({ numerator: 1, denominator: 5 });
    expect(
      equivalent.views.map((v) => ({
        kind: v.kind,
        marks: v.marks,
        selected: v.selectedMarks,
        units: v.unitsPerMark,
        ratio: v.ratio,
      })),
    ).toEqual(
      ['set', 'area'].map((kind) => ({
        kind,
        marks: 10,
        selected: 2,
        units: { numerator: 20, denominator: 1 },
        ratio: { numerator: 1, denominator: 5 },
      })),
    );
    for (const scene of unitsEquivalenceCases().filter((s) => s.storyId === '49')) {
      const all = [
        ...new Set(
          unitsEquivalencePages(scene).map((_, i, pages) =>
            unitsEquivalenceConversionCards(
              scene,
              unitsEquivalencePose(
                scene,
                scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
              ),
            )[0].lines.join(''),
          ),
        ),
      ].join('');
      if (scene.storyId === '49' && scene.record.quantity.state === 'conditional')
        expect(all).toContain(scene.record.quantity.condition);
    }
  });
  it('uses exact comparisons for near-limit extrema instead of float sorting', () => {
    const a = { numerator: 999999998, denominator: 999999999 },
      b = { numerator: 999999999, denominator: 1000000000 };
    expect(a.numerator / a.denominator).toBe(b.numerator / b.denominator);
    const domain = unitsEquivalenceDomain([b, a]);
    expect(domain).toEqual([a, b]);
    if (!domain) throw new Error('Missing exact domain');
    expect(unitsEquivalencePosition(a, domain)).toBe(0);
    expect(unitsEquivalencePosition(b, domain)).toBe(1);
    expect(unitsEquivalenceDomain([])).toBeNull();
  });
  it('rejects incompatible conversions/bases and supplied invented equality', () => {
    for (const story of unitsEquivalencePacket.stories) {
      const raw = structuredClone(story.proposal);
      if (story.id === '49') (raw.conversion as Rec).toUnit = 'USD';
      else ((raw.quantities as Rec[])[1].basis as Rec).population = 'elsewhere';
      const ctx = makeParseContext(story.words, story.window);
      expect(
        story.id === '49'
          ? parseExpansionUnitConversion(raw, ctx)
          : parseExpansionEquivalence(raw, ctx),
      ).toBeNull();
      const equation = { ...story.proposal, equation: 'invented equality' };
      const ctx2 = makeParseContext(story.words, story.window);
      expect(
        story.id === '49'
          ? parseExpansionUnitConversion(equation, ctx2)
          : parseExpansionEquivalence(equation, ctx2),
      ).toBeNull();
    }
  });
  it('keeps source-qualified states and unresolved conversion distinct from zero', () => {
    const story = unitsEquivalencePacket.stories[0],
      raw = structuredClone(story.proposal);
    const q = raw.quantity as Rec;
    q.state = 'unknown';
    q.qualifier = 'unknown';
    delete q.amount;
    const clauses = story.sourceText.split(/(?<=\.) /);
    clauses[1] = 'Ada Span is unknown metres during May among Harbor with denominator 12.';
    const scene = acceptedUnitsEquivalence(unitsEquivalenceSpeech(story, clauses, raw));
    expect(scene.result.state).toBe('unknown');
    expect('values' in scene.result).toBe(false);
    expect(unitsEquivalenceFields(scene).flatMap((f) => f.fields)).toContain('State: unknown');
    for (const source of unitsEquivalencePacket.stories.slice(1)) {
      const accepted = acceptedUnitsEquivalence(source);
      expect(
        unitsEquivalenceFields(accepted)
          .flatMap((f) => f.fields)
          .join(' '),
      ).toContain(
        source.id === '49'
          ? 'simulated sample'
          : source.id === '50' && source.proposal.subject === 'Selene'
            ? 'If access opens'
            : 'State: known',
      );
    }
  });
});
