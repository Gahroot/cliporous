import { describe, expect, it } from 'vitest';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import {
  COMMERCIAL_RAW_FIXTURES,
  COMMERCIAL_SOURCE_FIXTURES,
  type CommercialSourceFixture,
  parseCommercialFixture,
} from '../../remotion/compositions/explainer/business/commercial/fixtures';
import {
  commercialContentCounts,
  commercialPresentationFits,
} from '../../remotion/compositions/explainer/business/commercial/presentation';
import { COMMERCIAL_LIMITS } from '../../remotion/compositions/explainer/business/commercial/types';
import { isRec, makeParseContext, type Rec } from './kind-spec';

function member(raw: Rec, key: string): Rec {
  const value = raw[key];
  if (!isRec(value)) throw new Error(`missing authored ${key}`);
  return value;
}
function element(raw: Rec, key: string, index: number): Rec {
  const values = raw[key];
  if (!Array.isArray(values) || !isRec(values[index]))
    throw new Error(`missing authored ${key}[${index}]`);
  return values[index];
}
function contradiction(input: CommercialSourceFixture): CommercialSourceFixture {
  const fixture = structuredClone(input);
  const raw = fixture.raw;
  switch (fixture.id) {
    case 'OP-17':
      element(raw, 'tasks', 1).source = structuredClone(element(raw, 'tasks', 0).source);
      break;
    case 'OP-19':
      member(member(raw, 'used'), 'basis').unit = 'jobs';
      break;
    case 'OP-20':
      member(raw, 'delivery').state = 'observed';
      break;
    case 'OP-21':
      member(raw, 'dependency').state = 'removed';
      break;
    case 'OP-22':
      element(raw, 'compatibility', 0).state = 'compatible';
      break;
    case 'OP-23':
      member(element(raw, 'units', 1), 'standardUse').state = 'observed';
      break;
  }
  return fixture;
}

describe('commercial authored source fixtures and frozen dispatch', () => {
  it('covers all six recipes and exactly their catalog-declared modes', () => {
    expect(COMMERCIAL_RAW_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'OP-17',
      'OP-19',
      'OP-20',
      'OP-21',
      'OP-22',
      'OP-23',
    ]);
    for (const fixture of COMMERCIAL_RAW_FIXTURES) {
      const modes = BUSINESS_RECIPES.find((recipe) => recipe.id === fixture.id)?.modes;
      expect(modes).toBeDefined();
      expect(
        COMMERCIAL_SOURCE_FIXTURES.filter((item) => item.id === fixture.id).map(
          (item) => item.raw.visualMode,
        ),
      ).toEqual(modes);
    }
  });
  it.each(
    COMMERCIAL_SOURCE_FIXTURES,
  )('$fixtureId parses raw indexed evidence, stays within bounds and rejects contrary local facts', (fixture) => {
    const result = parseCommercialFixture(fixture);
    expect(result.issues).toEqual([]);
    expect(result.scene).not.toBeNull();
    if (!result.scene) throw new Error(`rejected authored ${fixture.fixtureId}`);
    const counts = commercialContentCounts(result.scene);
    expect(counts.identities).toBeLessThanOrEqual(COMMERCIAL_LIMITS.entities);
    expect(counts.links).toBeLessThanOrEqual(COMMERCIAL_LIMITS.sourceLinks);
    expect(counts.holds).toBeLessThanOrEqual(COMMERCIAL_LIMITS.holds);
    expect(commercialPresentationFits(result.scene)).toBe(true);
    const context = makeParseContext(fixture.words, fixture.window);
    expect(result.scene.setupAt).toBe(context.at(Number(fixture.raw.setupWord)));
    expect(result.scene.resolveAt).toBe(context.at(Number(fixture.raw.resolveWord)));
    const invalid = parseCommercialFixture(contradiction(fixture));
    expect(invalid.scene).toBeNull();
    expect(invalid.issues.length).toBeGreaterThan(0);
  });
  it.each(
    COMMERCIAL_RAW_FIXTURES,
  )('$id rejects unsupported data, missing subjects and nonfinite beat indices', (fixture) => {
    for (const patch of [
      { executable: 'not permitted' },
      { subject: 'Unsupported business' },
      { setupWord: NaN },
    ]) {
      const result = parseCommercialFixture({ ...fixture, raw: { ...fixture.raw, ...patch } });
      expect(result.scene).toBeNull();
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
  it.each(
    COMMERCIAL_RAW_FIXTURES,
  )('$id retains identical facts across diagram and hybrid', (fixture) => {
    const diagram = parseCommercialFixture({
      ...fixture,
      raw: { ...fixture.raw, visualMode: 'diagram' },
    });
    const hybrid = parseCommercialFixture({
      ...fixture,
      raw: { ...fixture.raw, visualMode: 'hybrid' },
    });
    expect(diagram.issues).toEqual([]);
    expect(hybrid.issues).toEqual([]);
    expect(diagram.scene).not.toBeNull();
    expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
  });
});
