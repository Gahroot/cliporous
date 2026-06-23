/**
 * Maps an `Archetype` (per active edit style) to a Remotion composition id.
 * `segment-render.ts` consults this before falling back to its FFmpeg path.
 *
 * Currently only PRESTYJ ships Remotion versions — the resolver is keyed on
 * (editStyleId, archetype) so other styles can opt in incrementally.
 */
import type { Archetype } from '../edit-styles/shared/archetypes'
import type { LongformArchetype } from '@shared/types'

export interface RemotionCompositionRef {
  /** Composition id registered in Root.tsx. */
  compositionId: string
  /** Whether this composition needs an `imagePath` prop. */
  needsImage: boolean
}

const PRESTYJ_MAP: Partial<Record<Archetype, RemotionCompositionRef>> = {
  'fullscreen-quote': {
    compositionId: 'FullscreenQuote',
    needsImage: false
  },
  // 'fullscreen-quote-plus-broll' is not in the canonical Archetype list yet.
  // When we add it as a new archetype, plug it here. For now,
  // FullscreenQuotePlusBroll is reachable only via direct render calls
  // (e.g. for the curiosity-gap or hook moments).
  'split-image': {
    compositionId: 'FullscreenQuotePlusBroll',
    needsImage: true
  }
}

const STYLE_MAPS: Record<string, Partial<Record<Archetype, RemotionCompositionRef>>> = {
  prestyj: PRESTYJ_MAP
}

export function resolveRemotionComposition(
  editStyleId: string | undefined,
  archetype: Archetype | undefined
): RemotionCompositionRef | null {
  if (!editStyleId || !archetype) return null
  const map = STYLE_MAPS[editStyleId]
  return map?.[archetype] ?? null
}

// ---------------------------------------------------------------------------
// Long-form (16:9) composition registry
//
// Kept separate from STYLE_MAPS (which is keyed on the 9:16 `Archetype` union)
// so the short-form resolver is untouched. `speaker` has no Remotion comp — it
// renders through the segmented FFmpeg path — so it maps to null.
// ---------------------------------------------------------------------------

const HORMOZI_LONGFORM_MAP: Record<LongformArchetype, RemotionCompositionRef | null> = {
  speaker: null,
  'concept-card': { compositionId: 'HormoziConceptCard', needsImage: false },
  'section-header': { compositionId: 'HormoziSectionHeader', needsImage: false }
}

const LONGFORM_STYLE_MAPS: Record<
  string,
  Record<LongformArchetype, RemotionCompositionRef | null>
> = {
  hormozi: HORMOZI_LONGFORM_MAP
}

/**
 * Resolve a long-form archetype to its Remotion composition. Returns null for
 * `speaker` (FFmpeg-rendered) or unknown styles/archetypes.
 */
export function resolveLongformRemotionComposition(
  editStyleId: string | undefined,
  archetype: LongformArchetype | undefined
): RemotionCompositionRef | null {
  if (!editStyleId || !archetype) return null
  const map = LONGFORM_STYLE_MAPS[editStyleId]
  return map?.[archetype] ?? null
}
