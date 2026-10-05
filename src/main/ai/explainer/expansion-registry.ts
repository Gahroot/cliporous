import type { ExpansionScene } from '../../remotion/compositions/explainer/expansion/types';
import type { ExplainerSceneBody } from '../../remotion/compositions/explainer/types';
import type { ExpansionPresetSpec } from './expansion-preset-spec';
import type { KindSpec, ParseContext, Rec } from './kind-spec';
import { getKindSpec } from './kinds';
import { EXPANSION_COMPUTING_SPECS } from './kinds-expansion-computing';
import { EXPANSION_DECISIONS_SPECS } from './kinds-expansion-decisions';
import { EXPANSION_GEOMETRY_SPECS } from './kinds-expansion-geometry';
import { EXPANSION_PHYSICAL_SPECS } from './kinds-expansion-physical';
import { EXPANSION_PROBABILITY_SPECS } from './kinds-expansion-probability';
import { EXPANSION_QUANTITIES_SPECS } from './kinds-expansion-quantities';
import { EXPANSION_REASONING_SPECS } from './kinds-expansion-reasoning';
import { EXPANSION_RELATIONSHIPS_SPECS } from './kinds-expansion-relationships';
import { EXPANSION_REPRESENTATIONS_SPECS } from './kinds-expansion-representations';
import { EXPANSION_TEMPORAL_SPECS } from './kinds-expansion-temporal';

export const ALL_EXPANSION_PRESET_SPECS: readonly ExpansionPresetSpec<ExpansionScene>[] = [
  ...EXPANSION_REASONING_SPECS,
  ...EXPANSION_PROBABILITY_SPECS,
  ...EXPANSION_QUANTITIES_SPECS,
  ...EXPANSION_DECISIONS_SPECS,
  ...EXPANSION_RELATIONSHIPS_SPECS,
  ...EXPANSION_TEMPORAL_SPECS,
  ...EXPANSION_REPRESENTATIONS_SPECS,
  ...EXPANSION_GEOMETRY_SPECS,
  ...EXPANSION_COMPUTING_SPECS,
  ...EXPANSION_PHYSICAL_SPECS,
];
const byRoute: ReadonlyMap<string, ExpansionPresetSpec<ExpansionScene>> = new Map(
  ALL_EXPANSION_PRESET_SPECS.map((spec) => [`${spec.kind}\0${spec.preset}`, spec]),
);
if (byRoute.size !== ALL_EXPANSION_PRESET_SPECS.length)
  throw new Error('Duplicate authored expansion route');
const kinds: ReadonlySet<string> = new Set(ALL_EXPANSION_PRESET_SPECS.map((spec) => spec.kind));
const presets: ReadonlySet<string> = new Set(ALL_EXPANSION_PRESET_SPECS.map((spec) => spec.preset));

export function getExpansionPresetSpec(
  kind: unknown,
  preset: unknown,
): ExpansionPresetSpec<ExpansionScene> | undefined {
  if (
    typeof kind !== 'string' ||
    typeof preset !== 'string' ||
    kind.length > 64 ||
    preset.length > 64
  )
    return undefined;
  return byRoute.get(`${kind}\0${preset}`);
}

type RegisteredSceneSpec = Omit<KindSpec, 'parse' | 'cues'> & {
  parse: (raw: Rec, ctx: ParseContext) => ExplainerSceneBody | null;
};

/** Exact preset pairs never replace a legacy kind's default validator or cues. */
export function getRegisteredSceneSpec(raw: Rec): RegisteredSceneSpec | undefined {
  const expansion = getExpansionPresetSpec(raw.kind, raw.preset);
  if (expansion) return expansion;
  if (typeof raw.kind !== 'string') return undefined;
  // New envelopes and mismatched recognized presets cannot fall back to a legacy explanation.
  if (
    (kinds.has(raw.kind) && Object.hasOwn(raw, 'template')) ||
    Object.hasOwn(raw, 'storyId') ||
    (typeof raw.preset === 'string' && presets.has(raw.preset))
  )
    return undefined;
  const legacy = getKindSpec(raw.kind);
  if (!legacy || !kinds.has(raw.kind) || raw.preset === undefined) return legacy;
  // Legacy preset families remain valid, but a supplied unsupported preset may not
  // disappear through a permissive default parser for an overlapping scene kind.
  return {
    ...legacy,
    parse: (candidate, ctx) => {
      const scene = legacy.parse(candidate, ctx);
      return scene && 'preset' in scene && scene.preset === candidate.preset ? scene : null;
    },
  };
}
