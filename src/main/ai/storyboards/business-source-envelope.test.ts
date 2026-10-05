import { describe, expect, it } from 'vitest';
import {
  BUSINESS_EXPLANATION_KINDS,
  isBusinessExplanationRecipe,
  isBusinessExplanationSourceEnvelope,
} from '../../../shared/business-explanation-source';
import { STORYBOARD_LIMITS, storyboardSourceInputBudget } from '../../../shared/storyboards';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import { storyboardInputBudget } from './contract';
import { boardFixture } from './fixtures';

function source(): Record<string, unknown> {
  return {
    sourceVersion: 1,
    recipe: 'OP-17',
    sourceChoices: { kind: 'business-blueprint', preset: 'back-office', startWord: 0, endWord: 20 },
    identityLinks: [
      { localId: 'business', sharedId: 'company', role: 'subject', startWord: 0, endWord: 2 },
    ],
  };
}

describe('business source persistence envelope (not semantic approval)', () => {
  it('enumerates exactly the eighty recipe choices', () => {
    for (let n = 1; n <= 80; n++)
      expect(isBusinessExplanationRecipe(`OP-${String(n).padStart(2, '0')}`)).toBe(true);
    for (const value of ['OP-00', 'OP-81', 'OP-1', 'OP-017', 'task-map', null, 17])
      expect(isBusinessExplanationRecipe(value)).toBe(false);
  });
  it('allows only the frozen business grammars and three scoped existing kinds', () => {
    expect([...BUSINESS_EXPLANATION_KINDS].sort()).toEqual(
      [...new Set(BUSINESS_RECIPES.map((recipe) => recipe.kind))].sort(),
    );
    expect(
      isBusinessExplanationSourceEnvelope({
        ...source(),
        sourceChoices: { kind: 'code', startWord: 0, endWord: 20 },
      }),
    ).toBe(false);
  });
  it('round-trips bounded word choices and identity links without changing them', () => {
    const value = source();
    const before = JSON.stringify(value);
    expect(isBusinessExplanationSourceEnvelope(value)).toBe(true);
    expect(isBusinessExplanationSourceEnvelope(JSON.parse(before))).toBe(true);
    expect(JSON.stringify(value)).toBe(before);
  });
  it('rejects unknown versions/fields and malformed or duplicate identity links', () => {
    const link = {
      localId: 'business',
      sharedId: 'company',
      role: 'subject',
      startWord: 0,
      endWord: 2,
    };
    for (const value of [
      { ...source(), sourceVersion: 3 },
      { ...source(), recipe: 'OP-81' },
      { ...source(), geometry: {} },
      { ...source(), identityLinks: [{ ...link, role: 'winner' }] },
      { ...source(), identityLinks: [link, link] },
      { ...source(), identityLinks: [{ ...link, endWord: 21 }] },
      { ...source(), identityLinks: [{ ...link, startWord: 0.5 }] },
      { ...source(), identityLinks: [{ ...link, sharedId: '../company' }] },
      { ...source(), identityLinks: [{ ...link, at: 2 }] },
      { ...source(), sourceChoices: { kind: 'business-blueprint', startWord: 2, endWord: 1 } },
    ])
      expect(isBusinessExplanationSourceEnvelope(value)).toBe(false);
  });
  it('rejects unsafe structures before accessing getters or serializing', () => {
    let reads = 0;
    const getter = {
      ...source(),
      get secret() {
        reads++;
        return 'secret';
      },
    };
    const cyclic = source();
    cyclic.self = cyclic;
    for (const value of [
      getter,
      cyclic,
      { ...source(), unknown: Number.NaN },
      { ...source(), unknown: () => 1 },
      { ...source(), unknown: 'x'.repeat(97) },
    ])
      expect(isBusinessExplanationSourceEnvelope(value)).toBe(false);
    expect(reads).toBe(0);
  });
  it('retains the existing whole-board budget and byte semantics', () => {
    const { spec } = boardFixture();
    expect(storyboardSourceInputBudget(spec)).toBe(true);
    expect(storyboardInputBudget(spec)).toBe(storyboardSourceInputBudget(spec));
    expect(new TextEncoder().encode(JSON.stringify(spec)).byteLength).toBe(
      Buffer.byteLength(JSON.stringify(spec), 'utf8'),
    );
    expect(STORYBOARD_LIMITS).toMatchObject({
      maxSpecBytes: 24_576,
      maxSpecNodes: 1_500,
      maxSpecDepth: 8,
      maxPanels: 5,
      maxElements: 48,
      maxModelMeshes: 180,
    });
  });
});
