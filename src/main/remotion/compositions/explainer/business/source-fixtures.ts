import type { PlannerWord, Rec } from '../../../../ai/explainer/kind-spec';
import type { ExplanationVisualMode } from '../diagrams/types';
import { approvalGateSourceFixture } from './authority/approval-fixture';
import { AUTHORITY_RAW_FIXTURES } from './authority/fixtures';
import { SHARED_DEPENDENCY_SOURCE_FIXTURES } from './capital/dependency-fixtures';
import { CAPITAL_SOURCE_FIXTURES } from './capital/fixtures';
import { BUSINESS_RECIPES } from './catalog';
import { COMMERCIAL_SOURCE_FIXTURES } from './commercial/fixtures';
import { BUSINESS_ALTERNATIVE_SOURCE_FIXTURES } from './decisions/alternative-fixtures';
import { DECISIONS_ACCEPTED_VARIANTS, DECISIONS_SOURCE_FIXTURES } from './decisions/fixtures';
import { ECONOMICS_SOURCE_FIXTURES } from './economics/fixtures';
import { FUNDS_SOURCE_FIXTURES } from './funds/fixtures';
import { INFRASTRUCTURE_SOURCE_FIXTURES } from './infrastructure/fixtures';
import { MARKETS_SOURCE_FIXTURES } from './markets/fixtures';
import { ORGANIZATION_SOURCE_FIXTURES } from './organization/fixtures';
import type { BusinessRecipeId } from './types';
import { WORK_SOURCE_FIXTURES } from './work/fixtures';

interface AuthoredSource {
  readonly id: string;
  readonly raw: Rec;
  readonly words: readonly PlannerWord[];
}
export interface BusinessSourceFixture {
  readonly id: BusinessRecipeId;
  readonly fixtureId: string;
  readonly visualMode: ExplanationVisualMode;
  readonly raw: Rec;
  readonly words: PlannerWord[];
}

/** Authored source choices only, never a renderer entry point or an approved opaque scene blob. */
const sources: readonly AuthoredSource[] = [
  ...WORK_SOURCE_FIXTURES,
  ...AUTHORITY_RAW_FIXTURES.map((fixture) => ({ ...fixture, id: fixture.recipeId })),
  approvalGateSourceFixture('diagram'),
  approvalGateSourceFixture('hybrid'),
  ...COMMERCIAL_SOURCE_FIXTURES,
  ...ORGANIZATION_SOURCE_FIXTURES,
  ...ECONOMICS_SOURCE_FIXTURES,
  ...MARKETS_SOURCE_FIXTURES,
  ...FUNDS_SOURCE_FIXTURES,
  ...CAPITAL_SOURCE_FIXTURES,
  ...SHARED_DEPENDENCY_SOURCE_FIXTURES,
  ...INFRASTRUCTURE_SOURCE_FIXTURES,
  ...DECISIONS_SOURCE_FIXTURES,
  ...DECISIONS_ACCEPTED_VARIANTS.filter((fixture) => fixture.id === 'OP-77'),
  ...BUSINESS_ALTERNATIVE_SOURCE_FIXTURES.map((fixture) => ({ ...fixture, id: 'OP-75' })),
];

/** Unsupported modes or missing authored sources fail closed, with no old-example substitution. */
export function businessSourceFixture(
  id: BusinessRecipeId,
  visualMode: ExplanationVisualMode,
): BusinessSourceFixture | null {
  const recipe = BUSINESS_RECIPES.find((record) => record.id === id);
  if (!recipe?.modes.includes(visualMode)) return null;
  const candidates = sources.filter((source) => source.id === id);
  const source =
    // Both presentations share one source scenario, including its conditions and word indices.
    candidates.find((candidate) => candidate.raw.visualMode === 'hybrid') ?? candidates[0];
  if (!source || source.raw.kind !== recipe.kind || source.raw.preset !== recipe.preset)
    return null;
  return {
    id,
    fixtureId: `business-${id}-${visualMode}`,
    visualMode,
    raw: { ...structuredClone(source.raw), visualMode },
    words: structuredClone([...source.words]),
  };
}

export function businessSourceFixtures(): BusinessSourceFixture[] {
  return BUSINESS_RECIPES.flatMap((recipe) =>
    recipe.modes.flatMap((mode) => {
      const fixture = businessSourceFixture(recipe.id, mode);
      return fixture ? [fixture] : [];
    }),
  );
}
