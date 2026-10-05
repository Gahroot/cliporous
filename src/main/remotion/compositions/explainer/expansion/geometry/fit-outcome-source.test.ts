import { describe, expect, it } from 'vitest';
import { parseExpansionPackingClearance } from '../../../../../ai/explainer/expansion-geometry-fit-scale-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { qualifiedResult } from './fit-scale-test-fixtures';

describe('packing preserves the literal unavailable source state, not an invented unknown outcome', () => {
  for (const state of ['unknown', 'missing', 'disputed'] as const) {
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      it(`${state}/${visualMode}: keeps the quoted outcome and unresolved fit verdict distinct`, () => {
        const source = qualifiedResult('59', state);
        const ctx = makeParseContext(source.words, source.window);
        const scene = parseExpansionPackingClearance({ ...source.proposal, visualMode }, ctx);
        expect(ctx.issues).toEqual([]);
        expect(scene?.outcome).toBe(state);
        expect(scene?.result.state).toBe(state);
        expect(scene?.result.verdict).toBe('unknown');
      });
    }
  }
});
