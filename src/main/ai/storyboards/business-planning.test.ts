import { describe, expect, it } from 'vitest';
import { expandBusinessSourceChoices } from '../../../shared/business-source-choices';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import { businessSourceFixture } from '../../remotion/compositions/explainer/business/source-fixtures';
import { ALL_KIND_SPECS } from '../explainer/kinds';
import { buildShortlist, SHORTLIST_LIMITS, scoreKind, shortlistText } from '../explainer/shortlist';
import { parseLongformSceneSpec } from '../explainer-scenes';
import { parseBusinessExplanationSource } from './business-adapters';
import { BUSINESS_PLANNING_MAX_BYTES, buildBusinessPlanningOffer } from './business-planning';

const context = { clipStart: 0, clipEnd: 90 };

describe('bounded business source-only planning offer', () => {
  it('bounds combined discovery and respects an existing 24-kind idea shortlist', () => {
    const words = BUSINESS_RECIPES.flatMap(
      (recipe) => businessSourceFixture(recipe.id, recipe.modes[0])?.words ?? [],
    );
    const kinds = ALL_KIND_SPECS.filter((spec) =>
      BUSINESS_RECIPES.some((recipe) => recipe.kind === spec.kind),
    );
    const existing = { kinds, heroProps: [], scores: {} };
    const before = structuredClone(existing.scores);
    const offer = buildBusinessPlanningOffer(words, existing);
    expect(Buffer.byteLength(offer.prompt)).toBeLessThanOrEqual(BUSINESS_PLANNING_MAX_BYTES);
    const selected = new Set(kinds.slice(0, 24).map((spec) => spec.kind));
    for (const source of offer.sourceExamples) {
      const recipe = BUSINESS_RECIPES.find((recipe) => recipe.id === source.recipe);
      if (!recipe) throw new Error('Unregistered recipe');
      expect(selected.has(recipe.kind)).toBe(true);
    }
    expect(existing.scores).toStrictEqual(before);
  });
  it.each(
    BUSINESS_RECIPES,
  )('$id discovers the recipe and reconstructs accepted examples', (recipe) => {
    const fixture = businessSourceFixture(recipe.id, recipe.modes[0]);
    if (!fixture) throw new Error(`Missing ${recipe.id}`);
    const before = structuredClone(fixture);
    const offer = buildBusinessPlanningOffer(fixture.words);
    expect(offer).toStrictEqual(buildBusinessPlanningOffer(fixture.words));
    expect(Buffer.byteLength(offer.prompt)).toBeLessThanOrEqual(BUSINESS_PLANNING_MAX_BYTES);
    for (const record of BUSINESS_RECIPES) {
      expect(offer.prompt).toContain(
        JSON.stringify({
          recipe: record.id,
          kind: record.kind,
          preset: record.preset,
          modes: record.modes,
          objective: record.objective,
        }),
      );
    }
    const shortlist = buildShortlist(fixture.words);
    expect(shortlist.kinds.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxKinds);
    expect(shortlist.heroProps.length).toBeLessThanOrEqual(SHORTLIST_LIMITS.maxProps);
    const relevant = shortlist.kinds.some(
      (spec) => spec.kind === recipe.kind && scoreKind(spec, shortlistText(fixture.words)) > 0,
    );
    const example = offer.sourceExamples.find((source) => source.recipe === recipe.id);
    expect(Boolean(example)).toBe(relevant);
    for (const source of offer.sourceExamples) {
      const record = BUSINESS_RECIPES.find((entry) => entry.id === source.recipe);
      if (!record) throw new Error('Unregistered recipe');
      expect(shortlist.kinds.some((spec) => spec.kind === record.kind)).toBe(true);
      const spec = ALL_KIND_SPECS.find((entry) => entry.kind === record.kind);
      if (!spec) throw new Error('Unregistered kind');
      expect(scoreKind(spec, shortlistText(fixture.words))).toBeGreaterThan(0);
      const author = businessSourceFixture(record.id, record.modes[0]);
      if (!author) throw new Error('Missing author source');
      const expanded = expandBusinessSourceChoices(source.sourceChoices);
      if (!expanded.ok) throw new Error(expanded.message);
      const body = author.raw;
      expect(expanded.choices).toStrictEqual(body);
      const parsed = parseBusinessExplanationSource(source, author.words, context);
      expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
      if (!parsed.ok) throw new Error('Rejected author example');
      expect(parsed.value.planned).toStrictEqual(
        parseLongformSceneSpec(body, author.words, context),
      );
    }
    expect(fixture).toStrictEqual(before);
  });

  it.each([
    'Business is important and companies should improve things.',
    'We had lunch and then walked home.',
    'The river bank has a current and the waterfall looks nice.',
  ])('does not force generic or false-friend talk: %s', (text) => {
    const words = text.split(' ').map((text, index) => ({ text, start: index, end: index + 0.5 }));
    const offer = buildBusinessPlanningOffer(words);
    expect(offer.sourceExamples).toHaveLength(0);
    expect(offer.prompt).toContain('omit an explanation rather than force one');
  });

  it('does not treat trigger relevance as accepted source evidence', () => {
    const author = businessSourceFixture('OP-01', 'diagram');
    if (!author) throw new Error('Missing OP-01');
    const offer = buildBusinessPlanningOffer(author.words);
    const source = offer.sourceExamples.find((entry) => entry.recipe === 'OP-01');
    if (!source) throw new Error('Missing relevant example');
    const unsupported = author.words.map((word) => ({ ...word, text: 'business' }));
    expect(parseBusinessExplanationSource(source, unsupported, context).ok).toBe(false);
    expect(offer.prompt).toContain('replace EVERY actor');
    expect(offer.prompt).toContain('Never invent cash, approvals, returns, probabilities');
    expect(offer.prompt).toContain('final hold');
  });
});
