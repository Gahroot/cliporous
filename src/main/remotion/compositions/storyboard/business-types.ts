import type {
  BusinessExplanationIdentityLink,
  BusinessExplanationKind,
  BusinessExplanationRecipe,
} from '../../../../shared/business-explanation-source';
import type { ExplainerScene } from '../explainer/types';

/** Compiler-produced native facts only; never persisted as an approved source blob. */
export interface BoardBusinessPanel {
  id: string;
  recipe: BusinessExplanationRecipe;
  scene: Extract<ExplainerScene, { kind: BusinessExplanationKind }>;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Absolute source clocks until the existing segment-time mapper rebases them once. */
  startAt: number;
  endAt: number;
  identityLinks: BusinessExplanationIdentityLink[];
  /** Code-authored model rail, reconstructed at compile time, never saved source geometry. */
  modelRail?: { x: number; y: number; width: number; height: number };
  /** Complete compiler-authored aggregates of native labels, not saved source text choices. */
  paragraphs?: { id: string; text: string }[];
}
