import {
  type BusinessExplanationSource,
  isBusinessExplanationSourceEnvelope,
} from '../../../shared/business-explanation-source';
import { compactBusinessSourceChoices } from '../../../shared/business-source-choices';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import { businessSourceFixture } from '../../remotion/compositions/explainer/business/source-fixtures';
import type { PlannerWord } from '../explainer/kind-spec';
import { ALL_KIND_SPECS } from '../explainer/kinds';
import {
  buildShortlist,
  IDEA_SHORTLIST_MAX_KINDS,
  type Shortlist,
  scoreKind,
  shortlistText,
} from '../explainer/shortlist';

/** Prompt-only ceiling; does not change the persisted source envelope or parser limits. */
export const BUSINESS_PLANNING_MAX_BYTES = 64_000;

export interface BusinessPlanningOffer {
  readonly prompt: string;
  readonly sourceExamples: readonly BusinessExplanationSource[];
}

const GUIDANCE = `Business explanation panels are optional specVersion:2 panels, never a new planner or renderer API.
The discovery menu lists all authored recipes; it does NOT assert relevance or authorize unsupported facts. Use only positively scored existing shortlisted kinds for detailed examples. Generic business talk and keyword false friends are insufficient; omit an explanation rather than force one.
Each illustrative author example is an exact sourceVersion:2 envelope: recipe, sourceChoices, identityLinks. Recipe, kind, preset and visualMode must match exactly; modes are diagram or hybrid as allowlisted. Empty identityLinks means no invented shared identities.
These are illustrative author examples, NOT defaults: replace EVERY actor, label, identity, word span, amount, condition and beat with actual source facts and GLOBAL transcript word indices. Never copy example facts or indices into another transcript.
Compact ChoiceId/ChoiceLabel/ChoiceFromWord/ChoiceToWord, SpanFromWord/SpanToWord and Value fields are passive identity/span/amount data, not geometry or a render API. Preserve the existing concrete schema and limits; do not add fields.
Bind each action, permission, approval and accountability to its stated actor and local evidence; capability is not authority. Preserve conditions, negation, expiry, unknown and scenario states. Numbers require exact source values, units, periods and compatible denominators. Never invent cash, approvals, returns, probabilities or winners; commitments are not paid cash and valuation is not liquidity.
Protect the complete source window: five strictly ordered word-indexed beats setupWord, actionWord, responseWord, checkWord, resolveWord, plus entrance and final hold. Never clip these to a panel/section boundary or supply numeric clocks.
No arbitrary URLs, code, geometry, styles, assets, scenes, render entry points or extra directives. Source parsing remains separate from export; null is better than unsupported data.`;

/** Deterministic source-only offer. An optional existing idea shortlist retains its 24-kind cap. */
export function buildBusinessPlanningOffer(
  words: readonly PlannerWord[],
  existingShortlist?: Shortlist,
): BusinessPlanningOffer {
  const shortlist = existingShortlist ?? buildShortlist(words, ALL_KIND_SPECS);
  const text = shortlistText(words);
  const selected = new Set(
    shortlist.kinds.slice(0, existingShortlist ? IDEA_SHORTLIST_MAX_KINDS : 16).map((s) => s.kind),
  );
  const relevant = new Set(
    ALL_KIND_SPECS.filter((spec) => selected.has(spec.kind) && scoreKind(spec, text) > 0).map(
      (spec) => spec.kind,
    ),
  );
  const discovery = BUSINESS_RECIPES.map(({ id, kind, preset, modes, objective }) => ({
    recipe: id,
    kind,
    preset,
    modes,
    objective,
  }));
  const sourceExamples: BusinessExplanationSource[] = [];
  const serialize = (): string =>
    `${GUIDANCE}\nBusiness recipe discovery: ${JSON.stringify(discovery)}\nIllustrative author sourceExamples: ${JSON.stringify(sourceExamples)}`;
  for (const recipe of BUSINESS_RECIPES) {
    if (!relevant.has(recipe.kind)) continue;
    // One accepted authored scenario per recipe, not duplicated once per presentation.
    const fixture = businessSourceFixture(recipe.id, recipe.modes[0]);
    if (!fixture) continue;
    // Keep the authored wrapper required by the concrete source parser;
    // it is not permission to generate panel geometry.
    const compact = compactBusinessSourceChoices(fixture.raw);
    if (!compact.ok) continue;
    const source = {
      sourceVersion: 2,
      recipe: recipe.id,
      sourceChoices: compact.choices,
      identityLinks: [],
    };
    if (!isBusinessExplanationSourceEnvelope(source)) continue;
    sourceExamples.push(source);
    if (Buffer.byteLength(serialize(), 'utf8') > BUSINESS_PLANNING_MAX_BYTES) sourceExamples.pop();
  }
  const prompt = serialize();
  if (Buffer.byteLength(prompt, 'utf8') > BUSINESS_PLANNING_MAX_BYTES)
    throw new Error('Business discovery metadata exceeds the prompt-only ceiling.');
  return { prompt, sourceExamples };
}
