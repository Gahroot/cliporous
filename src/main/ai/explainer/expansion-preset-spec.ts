import type { ExpansionStoryBase } from '../../remotion/compositions/explainer/expansion/scene-types';
import type { ExplainerLayout, SceneCue } from '../../remotion/compositions/explainer/types';
import type { KindFamily, ParseContext, Rec } from './kind-spec';

/** Local pack definition; NOT a registered KindSpec until its real views/fixtures are ready. */
export interface ExpansionPresetSpec<
  T extends ExpansionStoryBase & { kind: string; preset: string },
> {
  readonly storyId: T['storyId'];
  readonly kind: T['kind'];
  readonly preset: T['preset'];
  readonly describe: string;
  readonly schema: string;
  readonly limits: string;
  readonly family: KindFamily;
  readonly layouts: readonly ExplainerLayout[];
  readonly durationSec: readonly [number, number];
  readonly triggers: readonly RegExp[];
  readonly avoid: string;
  readonly parse: (raw: Rec, ctx: ParseContext) => T | null;
  readonly cues: (scene: ExpansionStoryBase) => SceneCue[];
}
