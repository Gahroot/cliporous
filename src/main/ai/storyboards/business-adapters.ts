import {
  type BusinessExplanationIdentityLink,
  type BusinessExplanationSource,
  isBusinessExplanationSourceEnvelope,
} from '../../../shared/business-explanation-source';
import { expandBusinessSourceChoices } from '../../../shared/business-source-choices';
import { validLongformWords } from '../../../shared/longform-scenes';
import {
  STORYBOARD_LIMITS,
  type StoryboardDiagnostic,
  type StoryboardResult,
  storyboardSourceInputBudget,
} from '../../../shared/storyboards';
import type { WordTimestamp } from '../../../shared/types';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import type { BusinessRecipe } from '../../remotion/compositions/explainer/business/types';
import {
  EXPLAINER_LIMITS,
  type PlannedExplainerScene,
  parseLongformSceneSpec,
} from '../explainer-scenes';
import {
  businessExplanationIdentities,
  type ValidatedBusinessIdentity,
} from './business-identities';
import type { StoryboardParseContext } from './contract';

export type BusinessRecipeRecord = BusinessRecipe;
export interface ReconstructedBusinessIdentity extends ValidatedBusinessIdentity {
  readonly link?: BusinessExplanationIdentityLink;
}
export interface BusinessExplanationReconstruction {
  readonly source: BusinessExplanationSource;
  readonly recipe: BusinessRecipeRecord;
  readonly planned: PlannedExplainerScene;
  readonly identities: readonly ReconstructedBusinessIdentity[];
}
function failure(
  code: StoryboardDiagnostic['code'],
  message: string,
  context: StoryboardParseContext,
): StoryboardResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        code,
        message,
        repairable: false,
        ...(context.sourceId ? { sourceId: context.sourceId } : {}),
      },
    ],
  };
}
const wordIndex = (value: unknown, last: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= last;
const plain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** Security scan only: identity vocabulary is exclusively projected from concrete parsed facts. */
function forbiddenChoices(value: unknown): boolean {
  if (typeof value === 'string')
    return (
      /(?:https?|file|data|javascript):|www\.|[<>`]/iu.test(value) ||
      [...value].some((character) => character.charCodeAt(0) < 32)
    );
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /^(?:scene|geometry|mesh|canvas|stage|style|styles|palette|code|html|svg|url|src|renderer|entryPoint|component|cues|chained|startTime|endTime|finalHoldSeconds|setupAt|actionAt|responseAt|checkAt|resolveAt|at|overlayStamp|laterStamp|annotation|reaction|pulses|dimWord|dimAt|stampWord|stampText|continues|connectFrom)$/iu.test(
        key,
      ) ||
      /(?:At)$/u.test(key) ||
      forbiddenChoices(child),
  );
}
/** Pure, deterministic source reconstruction. This neither registers nor compiles/render-plans a panel. */
export function parseBusinessExplanationSource(
  input: unknown,
  words: WordTimestamp[],
  context: StoryboardParseContext,
): StoryboardResult<BusinessExplanationReconstruction> {
  if (!storyboardSourceInputBudget(input))
    return failure(
      'budget',
      'Business explanation exceeds the existing 24KB / 1500-node / depth-8 JSON envelope, or contains non-JSON/getter/cyclic data. Caps are not relaxed.',
      context,
    );
  if (plain(input) && input.sourceVersion !== 1 && input.sourceVersion !== 2)
    return failure(
      'version',
      'Unsupported business explanation sourceVersion; preserve as unrenderable source, never convert.',
      context,
    );
  if (!isBusinessExplanationSourceEnvelope(input))
    return failure(
      'shape',
      'Expected the exact supported business explanation envelope, allowlisted recipe/kind and bounded identity links.',
      context,
    );
  if (
    !Number.isFinite(context.clipStart) ||
    context.clipStart < 0 ||
    !Number.isFinite(context.clipEnd) ||
    context.clipEnd <= context.clipStart ||
    !Array.isArray(words) ||
    words.some(
      (word) =>
        !plain(word) ||
        ['text', 'start', 'end'].some(
          (key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(word, key) ?? {}, 'value'),
        ),
    )
  )
    return failure(
      'words',
      'A valid absolute source transcript with data-only timestamps and finite clip bounds is required.',
      context,
    );
  const sourceDuration = words.reduce(
    (duration, word) => Math.max(duration, word.end),
    context.clipEnd,
  );
  if (!validLongformWords(words, sourceDuration))
    return failure(
      'words',
      'Invalid ordered source transcript; clip bounds do not truncate transcript validation.',
      context,
    );
  const source = structuredClone(input);
  const expanded =
    source.sourceVersion === 2
      ? expandBusinessSourceChoices(source.sourceChoices)
      : { ok: true as const, choices: source.sourceChoices };
  if (!expanded.ok) return failure('shape', expanded.message, context);
  const choices = expanded.choices;
  const recipe = BUSINESS_RECIPES.find((record) => record.id === source.recipe);
  if (!recipe || choices.kind !== recipe.kind || choices.preset !== recipe.preset)
    return failure(
      'unsupported',
      'Recipe kind/preset must exactly match the authored BUSINESS_RECIPES allowlist.',
      context,
    );
  if (forbiddenChoices(choices))
    return failure(
      'unsupported',
      'Source choices cannot contain cooked scenes, numeric beat clocks, render directives, code, URLs, geometry or arbitrary entry points.',
      context,
    );
  const mode = choices.visualMode;
  if ((mode !== 'diagram' && mode !== 'hybrid') || !recipe.modes.includes(mode))
    return failure(
      'unsupported',
      'An explicit allowlisted diagram/hybrid presentation is required for this exact recipe.',
      context,
    );
  const start = choices.startWord,
    end = choices.endWord;
  if (!wordIndex(start, words.length - 1) || !wordIndex(end, words.length - 1) || end <= start)
    return failure('words', 'Source word window does not address this transcript.', context);
  if (
    context.section &&
    (!wordIndex(context.section.startWord, words.length - 1) ||
      !wordIndex(context.section.endWord, words.length - 1) ||
      start < context.section.startWord ||
      end > context.section.endWord)
  )
    return failure(
      'timing',
      'Section clips the protected explanation interval; do not reconstruct a partial story.',
      context,
    );
  const fullStart = Math.max(0, words[start].start - EXPLAINER_LIMITS.leadInSec),
    fullEnd = words[end].end + EXPLAINER_LIMITS.tailSec;
  if (context.clipStart > fullStart || context.clipEnd < fullEnd)
    return failure(
      'timing',
      'Clip bounds must preserve the whole source window including entrance, five beats and final hold.',
      context,
    );
  const beats = [
    choices.setupWord,
    choices.actionWord,
    choices.responseWord,
    choices.checkWord,
    choices.resolveWord,
  ];
  if (
    beats.some((beat, index) => {
      const previous = beats[index - 1];
      return (
        !wordIndex(beat, end) ||
        beat < start ||
        (index > 0 && typeof previous === 'number' && beat <= previous)
      );
    })
  )
    return failure(
      'timing',
      'Five strictly ordered source-word-indexed beats are required; never accept numeric source clocks.',
      context,
    );
  const planned = parseLongformSceneSpec(choices, words, {
    clipStart: context.clipStart,
    clipEnd: context.clipEnd,
  });
  if (!planned)
    return failure(
      'evidence',
      'The real concrete longform source parser rejected identities, quantities, evidence, source states or readable protected timing.',
      context,
    );
  const scene = planned.scene;
  const parsedMode =
    scene.kind === 'possible-futures'
      ? scene.businessAlternatives?.visualMode
      : 'visualMode' in scene
        ? scene.visualMode
        : undefined;
  if (
    scene.kind !== recipe.kind ||
    !('preset' in scene) ||
    scene.preset !== recipe.preset ||
    parsedMode !== mode ||
    planned.startTime !== fullStart ||
    planned.endTime !== fullEnd
  )
    return failure(
      'timing',
      'Reconstruction changed the approved recipe/presentation or clipped its protected source interval.',
      context,
    );
  let identities: ValidatedBusinessIdentity[];
  try {
    identities = businessExplanationIdentities(scene, { choices, words });
  } catch {
    return failure(
      'identity',
      'Concrete parsed identity vocabulary is unsupported or contains conflicting source IDs/evidence.',
      context,
    );
  }
  if (identities.length > STORYBOARD_LIMITS.maxElements)
    return failure(
      'budget',
      'Concrete identities exceed the unchanged 48-element board ceiling.',
      context,
    );
  const sharedIds = new Set<string>();
  for (const link of source.identityLinks) {
    const entry = identities.find((identity) => identity.identity.id === link.localId);
    if (
      !entry?.roles.includes(link.role) ||
      entry.identity.source.fromWord !== link.startWord ||
      entry.identity.source.toWord !== link.endWord
    )
      return failure(
        'identity',
        'Identity link must match an actual concrete source ID, semantic role and its exact independently validated evidence span.',
        context,
      );
    if (sharedIds.has(link.sharedId))
      return failure(
        'identity',
        'Distinct local identities cannot be collapsed into one shared identity without explicit board-level equivalence evidence.',
        context,
      );
    sharedIds.add(link.sharedId);
  }
  return {
    ok: true,
    value: {
      source,
      recipe,
      planned,
      identities: identities.map((entry) => {
        const link = source.identityLinks.find((link) => link.localId === entry.identity.id);
        return { ...entry, ...(link ? { link } : {}) };
      }),
    },
  };
}
