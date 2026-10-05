import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { STORYBOARD_LIMITS } from '../../../../../../shared/storyboards';
import { BUSINESS_RECIPES } from '../catalog';
import { AUTHORITY_ASSET_BOUNDS, AUTHORITY_ASSET_BUDGETS } from './authority-poses';
import { BUSINESS_ASSETS, businessAsset } from './catalog';
import { FUNDS_ASSET_BOUNDS, FUNDS_ASSET_BUDGETS } from './funds-poses';
import { INFRASTRUCTURE_ASSET_BOUNDS, INFRASTRUCTURE_ASSET_BUDGETS } from './infrastructure-poses';
import { RETAIL_ASSET_BOUNDS, RETAIL_ASSET_BUDGETS } from './retail-poses';

const budgets = {
  ...RETAIL_ASSET_BUDGETS,
  ...AUTHORITY_ASSET_BUDGETS,
  ...FUNDS_ASSET_BUDGETS,
  ...INFRASTRUCTURE_ASSET_BUDGETS,
};
const bounds = {
  ...RETAIL_ASSET_BOUNDS,
  ...AUTHORITY_ASSET_BOUNDS,
  ...FUNDS_ASSET_BOUNDS,
  ...INFRASTRUCTURE_ASSET_BOUNDS,
};

describe('all authored business assemblies, metadata not rendered coverage', () => {
  it('covers exactly A-01–16 without promoting them to generic heroes', () => {
    expect(BUSINESS_ASSETS.map((entry) => entry.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `A-${String(index + 1).padStart(2, '0')}`),
    );
    for (const entry of BUSINESS_ASSETS) {
      expect(entry.provenance).toBe('project-authored');
      expect(entry.standaloneHero).toBe(false);
      expect(entry.sourceDependencies.length).toBeGreaterThan(0);
      expect(entry.allowedRecipes.length).toBeGreaterThan(0);
      expect(entry.allowedRecipes).toEqual(
        BUSINESS_RECIPES.filter((recipe) => recipe.assets.includes(entry.id)).map(
          (recipe) => recipe.id,
        ),
      );
      expect(businessAsset(entry.id)).toBe(entry);
    }
    expect(businessAsset('A-17')).toBeNull();
    expect(businessAsset('remote-asset')).toBeNull();
  });
  it('matches the independently tested family budgets/envelopes rather than guessing counts', () => {
    for (const [id, ceiling] of Object.entries(budgets)) {
      expect(businessAsset(id)?.authoredMeshCeiling).toBe(ceiling);
      expect(businessAsset(id)?.bounds).toEqual(
        Object.entries(bounds).find(([key]) => key === id)?.[1],
      );
    }
  });
  it('fits six maximum assemblies without increasing the existing cumulative mesh cap', () => {
    expect(STORYBOARD_LIMITS.maxProps).toBe(6);
    expect(STORYBOARD_LIMITS.maxModelMeshes).toBe(180);
    const maximum = Math.max(...BUSINESS_ASSETS.map((entry) => entry.authoredMeshCeiling));
    expect(maximum).toBe(24);
    expect(maximum * STORYBOARD_LIMITS.maxProps).toBeLessThanOrEqual(
      STORYBOARD_LIMITS.maxModelMeshes,
    );
    for (const entry of BUSINESS_ASSETS) {
      for (const [axis, minimum] of entry.bounds.min.entries()) {
        const maximum = entry.bounds.max[axis];
        expect(Number.isFinite(minimum)).toBe(true);
        expect(Number.isFinite(maximum)).toBe(true);
        expect(maximum).toBeGreaterThan(minimum);
      }
    }
  });
  it('keeps runtime metadata transitively free of React, models, stages and main imports', () => {
    const visited = new Set<string>();
    function inspect(url: URL): void {
      if (visited.has(url.href)) return;
      visited.add(url.href);
      const source = ts.createSourceFile(
        url.pathname,
        readFileSync(url, 'utf8'),
        ts.ScriptTarget.Latest,
      );
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier))
          throw new Error('Nonliteral catalog import');
        const target = statement.moduleSpecifier.text;
        expect(target.startsWith('.'), `external runtime import ${target}`).toBe(true);
        expect(target).not.toMatch(/(?:Scene|models|parts|motion|stage|renderer|\/ai\/)/u);
        inspect(new URL(`${target}.ts`, url));
      }
    }
    inspect(new URL('./catalog.ts', import.meta.url));
    expect(visited.size).toBe(2);
  });
});
