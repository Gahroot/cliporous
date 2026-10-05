import { describe, expect, it } from 'vitest';
import {
  EXPANSION_CATALOG,
  EXPANSION_KITS,
  EXPANSION_MOTION_TREATMENTS,
  EXPANSION_PACKS,
  EXPANSION_TREATMENTS,
  expansionEntry,
  expansionStory,
} from './catalog';
import { expansionEntityId } from './scene-types';

describe('approved expansion inventory', () => {
  it('freezes 80 ordered research IDs and unique literal routes in ten eight-story packs', () => {
    expect(EXPANSION_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 80 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
    expect(new Set(EXPANSION_CATALOG.map((entry) => `${entry.kind}/${entry.preset}`)).size).toBe(
      80,
    );
    for (const pack of EXPANSION_PACKS) {
      expect(EXPANSION_CATALOG.filter((entry) => entry.pack === pack)).toHaveLength(8);
    }
    expect(expansionStory('01')).toMatchObject({
      kind: 'retrieval-grounding',
      preset: 'trace-chain',
    });
    expect(expansionStory('80')).toMatchObject({ kind: 'field-map', preset: 'directional-field' });
  });

  it('declares both complete modes and speaker-visible portrait layouts without raising limits', () => {
    for (const entry of EXPANSION_CATALOG) {
      expect(entry.modes).toEqual(['diagram', 'hybrid']);
      expect(entry.layouts).toEqual(['stack', 'stack-flipped']);
      expect(entry.layouts).not.toContain('takeover');
      expect(entry.presentations).toEqual(['speaker-side', 'speaker-pip', 'full-frame']);
      expect(entry.acceptance).toEqual({
        durationSec: [5, 12],
        beatCount: 5,
        finalHoldSec: 0.8,
        requiresSourceParity: true,
        requiresProductionProof: true,
        requiresNativeMedia: true,
      });
      expect(entry.sourceRequirements.length).toBeGreaterThan(20);
      expect(entry.bundleSources).toContain(
        `src/main/ai/explainer/expansion-${entry.pack}-contract.ts`,
      );
      expect(entry.sourceFixture).toMatch(/fixtures\/expansion\/[a-z]+\.source\.json$/);
      expect(entry.renderFixture).toMatch(/fixtures\/expansion\/[a-z]+\.json$/);
      expect(entry.kits.every((kit) => EXPANSION_KITS.some((item) => item.id === kit))).toBe(true);
    }
  });

  it('keeps the separate 12-kit, 8-treatment and 12-motion-treatment inventories bounded', () => {
    expect(EXPANSION_KITS).toHaveLength(12);
    expect(new Set(EXPANSION_KITS.map((kit) => kit.id)).size).toBe(12);
    expect(EXPANSION_TREATMENTS).toHaveLength(8);
    expect(EXPANSION_MOTION_TREATMENTS).toHaveLength(12);
    for (const treatment of EXPANSION_TREATMENTS) {
      expect(treatment.required.length).toBeGreaterThan(30);
      for (const id of treatment.stories) expect(expansionStory(id).id).toBe(id);
      for (const kit of treatment.kits)
        expect(EXPANSION_KITS.some((item) => item.id === kit)).toBe(true);
    }
  });

  it('resolves only exact known routes and never silently substitutes a legacy preset', () => {
    for (const entry of EXPANSION_CATALOG) {
      expect(expansionEntry(entry.kind, entry.preset)).toBe(entry);
    }
    for (const pair of [
      ['retrieval-grounding', undefined],
      ['retrieval-grounding', 'evidence-found'],
      ['equation', 'unknown'],
      ['unknown', 'factorization'],
      [null, 'pareto'],
      ['ranking', { preset: 'rank-change' }],
      ['quadrant', 'RISK-MATRIX'],
    ])
      expect(expansionEntry(pair[0], pair[1])).toBeNull();
  });

  it('requires an explicit per-story derivation whitelist', () => {
    expect(expansionStory('42').allowedDerivations).toEqual(['critical-path']);
    expect(expansionStory('54').allowedDerivations).toEqual(['matrix-product']);
    expect(expansionStory('73').allowedDerivations).toEqual([]);
    expect(expansionStory('79').allowedDerivations).toEqual([]);
  });

  it('generates stable bounded IDs without labels, random state or map ordering', () => {
    expect(expansionEntityId('01', 0)).toBe('expansion-01-entity-0');
    expect([3, 0, 3].map((index) => expansionEntityId('07', index))).toEqual([
      'expansion-07-entity-3',
      'expansion-07-entity-0',
      'expansion-07-entity-3',
    ]);
    for (const index of [-1, 100, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => expansionEntityId('01', index)).toThrow(/bounds/);
  });
});
