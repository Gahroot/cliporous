import { isLongformPalette } from '@shared/longform-palette';
import {
  isSceneFirstPlanEnvelope,
  longformSourceFingerprint,
  sceneFirstPlanProblem,
  validLongformWords,
} from '@shared/longform-scenes';
import { BUILTIN_PALETTES } from '@shared/palettes';
import type { LongformEditPlan } from '@shared/types';
import { longformApprovalProblem } from '../lib/longform-approval';
import {
  LONGFORM_PALETTE_PROBLEM,
  type LongformPlanRecord,
  type LongformPlanVersion,
} from '../store/longform-slice';
import type { SourceVideo, TranscriptionData } from '../store/types';
import { LONGFORM_RENDER_DEFAULTS } from './render-defaults';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyPlan(value: unknown): value is LongformEditPlan {
  if (
    !isRecord(value) ||
    (value.mode !== undefined && value.mode !== 'legacy') ||
    (value.schemaVersion !== undefined && value.schemaVersion !== 1) ||
    !Array.isArray(value.phrases) ||
    !Array.isArray(value.blocks) ||
    (value.cards !== undefined && !Array.isArray(value.cards)) ||
    typeof value.reasoning !== 'string' ||
    typeof value.generatedAt !== 'number'
  )
    return false;
  const timed = (item: unknown): item is Record<string, unknown> =>
    isRecord(item) &&
    typeof item.startTime === 'number' &&
    Number.isFinite(item.startTime) &&
    typeof item.endTime === 'number' &&
    Number.isFinite(item.endTime);
  return (
    value.phrases.every((item) => timed(item) && typeof item.text === 'string') &&
    value.blocks.every((item) => timed(item) && typeof item.kind === 'string') &&
    (value.cards === undefined ||
      value.cards.every((item) => timed(item) && typeof item.kind === 'string'))
  );
}

function recoveryPlan(): LongformEditPlan {
  return {
    phrases: [],
    blocks: [],
    cards: [],
    reasoning: 'Saved plan retained for recovery. Generate a supported draft to continue.',
    generatedAt: 0,
  };
}

function planProblem(
  plan: unknown,
  source: SourceVideo | undefined,
  transcript: TranscriptionData | undefined,
): string | null {
  if (isLegacyPlan(plan)) return null;
  if (!isSceneFirstPlanEnvelope(plan)) return sceneFirstPlanProblem(plan);
  const words = transcript?.words;
  const duration = source?.duration ?? 0;
  if (
    !validLongformWords(words, duration) ||
    plan.sourceDuration !== duration ||
    plan.sourceFingerprint !== longformSourceFingerprint(words, duration)
  )
    return 'This saved plan no longer matches the source transcript or duration. Generate a new draft; the saved data is preserved.';
  return null;
}

function paletteProblem(paletteId: unknown, palette: unknown): string | null {
  if (palette !== undefined)
    return isLongformPalette(palette) && palette.id === paletteId ? null : LONGFORM_PALETTE_PROBLEM;
  // Older built-in versions did not require snapshots. Custom palettes can only
  // be recovered from the embedded version, never today's mutable library.
  return paletteId === undefined || BUILTIN_PALETTES.some((item) => item.id === paletteId)
    ? null
    : LONGFORM_PALETTE_PROBLEM;
}

/** Additive restoration: unsupported data is retained, never silently treated as a usable legacy edit. */
export function restoreLongformPlans(
  input: unknown,
  sources: SourceVideo[],
  transcriptions: Record<string, TranscriptionData>,
): Record<string, LongformPlanRecord> {
  if (!isRecord(input)) return {};
  const result: Record<string, LongformPlanRecord> = {};
  for (const [sourceId, raw] of Object.entries(input).sort(([a], [b]) => a.localeCompare(b))) {
    if (['__proto__', 'prototype', 'constructor'].includes(sourceId)) continue;
    const source = sources.find((candidate) => candidate.id === sourceId);
    const transcript = transcriptions[sourceId];
    const problem =
      planProblem(isRecord(raw) ? raw.plan : undefined, source, transcript) ||
      (isRecord(raw) ? paletteProblem(raw.paletteId, raw.palette) : null);
    // Existing metadata is maintained through the project's record type; plan payloads are checked separately.
    const record = isRecord(raw) ? (raw as unknown as LongformPlanRecord) : undefined;
    const safePlan =
      record && (isLegacyPlan(record.plan) || isSceneFirstPlanEnvelope(record.plan))
        ? record.plan
        : recoveryPlan();
    const versions: LongformPlanVersion[] | undefined = Array.isArray(record?.versions)
      ? record.versions.flatMap((version) => {
          if (!isRecord(version) || typeof version.id !== 'string') return [];
          const versionProblem =
            planProblem(version.plan, source, transcript) ||
            paletteProblem(version.paletteId, version.palette);
          return [
            {
              ...version,
              plan:
                isLegacyPlan(version.plan) || isSceneFirstPlanEnvelope(version.plan)
                  ? version.plan
                  : recoveryPlan(),
              ...(versionProblem ? { validationProblem: versionProblem } : {}),
            },
          ];
        })
      : undefined;
    const restored: LongformPlanRecord = {
      ...(record ?? {}),
      plan: safePlan,
      skin: record?.skin ?? LONGFORM_RENDER_DEFAULTS.longformSkinId,
      paletteId: record?.paletteId ?? LONGFORM_RENDER_DEFAULTS.longformPaletteId,
      ...(versions ? { versions } : {}),
      ...(problem ||
      versions?.some((version) => version.validationProblem) ||
      (Array.isArray(record?.versions) && versions?.length !== record.versions.length)
        ? { preservedPlanData: record?.preservedPlanData ?? raw }
        : {}),
      ...(problem
        ? {
            validationProblem: problem,
            status: 'draft',
            approvedVersionId: null,
          }
        : {}),
    };
    const approvalProblem = longformApprovalProblem(restored);
    if (approvalProblem) {
      restored.validationProblem = approvalProblem;
      restored.preservedPlanData ??= raw;
      restored.status = 'draft';
      restored.approvedVersionId = null;
    }
    result[sourceId] = restored;
  }
  return result;
}
