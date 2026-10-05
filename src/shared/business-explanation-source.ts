import { LONGFORM_SCENE_LIMITS, type LongformJson } from './longform-scenes';
import { type StoryboardSourceSpan, storyboardSourceInputBudget } from './storyboards';

/** Persistence choices only. No scene snapshots, geometry, styles or render entry points. */
export const BUSINESS_EXPLANATION_SOURCE_VERSION = 2 as const;
export type BusinessExplanationRecipe =
  | `OP-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `OP-${1 | 2 | 3 | 4 | 5 | 6 | 7}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'OP-80';

export const BUSINESS_EXPLANATION_KINDS = [
  'task-map',
  'coordination-map',
  'work-redesign',
  'delegation-scope',
  'authority-handoff',
  'constraint-check',
  'business-blueprint',
  'business-replication',
  'organization-map',
  'system-reconciliation',
  'operating-cost',
  'scale-economics',
  'value-capture',
  'market-dependency',
  'procurement-commitment',
  'fund-lifecycle',
  'distribution-waterfall',
  'fund-liquidity',
  'economic-rights',
  'capital-structure',
  'investment-outcomes',
  'capacity-map',
  'operating-lineage',
  'staged-decision',
  'measurement-frame',
  'uncertainty-album',
  'agent-workflow',
  'portfolio-exposure',
  'possible-futures',
] as const;
export type BusinessExplanationKind = (typeof BUSINESS_EXPLANATION_KINDS)[number];

export const BUSINESS_IDENTITY_ROLES = ['subject', 'actor', 'task', 'asset', 'claim'] as const;
export type BusinessIdentityRole = (typeof BUSINESS_IDENTITY_ROLES)[number];

export interface BusinessExplanationIdentityLink extends StoryboardSourceSpan {
  /** Identity in this explanation's validated source vocabulary, never a property path. */
  localId: string;
  /** Stable identity in the board. Linking does not assert a relationship or ownership. */
  sharedId: string;
  role: BusinessIdentityRole;
}

export interface BusinessExplanationSource {
  /** 1 preserves native choices; 2 compacts identity/word-span selectors without changing facts. */
  sourceVersion: 1 | 2;
  recipe: BusinessExplanationRecipe;
  /**
   * The existing word-indexed source choices for this recipe, not an approved parsed scene.
   * The allowlisted adapter must re-run its concrete source parser against the transcript.
   * Labels, quantities, states and conditions are untrusted until that reconstruction.
   */
  sourceChoices: Record<string, LongformJson> & { kind: BusinessExplanationKind };
  identityLinks: BusinessExplanationIdentityLink[];
}

export function isBusinessExplanationRecipe(value: unknown): value is BusinessExplanationRecipe {
  return typeof value === 'string' && /^OP-(?:0[1-9]|[1-7][0-9]|80)$/.test(value);
}

/** Shape only: never authorizes rendering. Main must validate the recipe and every source fact. */
export function isBusinessExplanationSourceEnvelope(
  input: unknown,
): input is BusinessExplanationSource {
  if (!storyboardSourceInputBudget(input)) return false;
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const word = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < LONGFORM_SCENE_LIMITS.maxWords;
  const supportedKind = (value: unknown): boolean =>
    BUSINESS_EXPLANATION_KINDS.some((kind) => kind === value);
  const id = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
  if (
    !record(input) ||
    !exact(input, ['sourceVersion', 'recipe', 'sourceChoices', 'identityLinks']) ||
    (input.sourceVersion !== 1 && input.sourceVersion !== 2) ||
    !isBusinessExplanationRecipe(input.recipe) ||
    !record(input.sourceChoices) ||
    !word(input.sourceChoices.startWord) ||
    !word(input.sourceChoices.endWord) ||
    input.sourceChoices.endWord <= input.sourceChoices.startWord ||
    !supportedKind(input.sourceChoices.kind) ||
    !Array.isArray(input.identityLinks) ||
    input.identityLinks.length > 8
  )
    return false;
  const start = input.sourceChoices.startWord;
  const end = input.sourceChoices.endWord;
  const locals = new Set<string>();
  return input.identityLinks.every((link: unknown) => {
    if (
      !record(link) ||
      !exact(link, ['localId', 'sharedId', 'role', 'startWord', 'endWord']) ||
      !id(link.localId) ||
      !id(link.sharedId) ||
      locals.has(link.localId) ||
      !BUSINESS_IDENTITY_ROLES.some((role) => role === link.role) ||
      !word(link.startWord) ||
      !word(link.endWord) ||
      link.startWord < start ||
      link.endWord > end ||
      link.endWord < link.startWord
    )
      return false;
    locals.add(link.localId);
    return true;
  });
}
