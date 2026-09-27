/**
 * Single entry point for batch rendering.
 *
 * Without explicit ids, it renders approved clips. With explicit ids, that list
 * defines the batch regardless of review status, so rendering never has to rewrite
 * pending or rejected decisions.
 */

import { toast } from 'sonner';

import { useStore } from '@/store';
import type { AppState, ClipCandidate, RenderProgress, StitchedClipCandidate } from '@/store/types';
import { getCreatorProfiles } from './creator-profiles';
import { estimateExport, hashRenderOptions, runExportPreflight } from './export-queue';
import { PRESTYJ_CAPTION_STYLE } from './render-defaults';

interface StartApprovedRenderResult {
  started: boolean;
  /** Reason returned when started=false. UI uses this for diagnostics only. */
  reason?:
    | 'no-source'
    | 'source-offline'
    | 'no-clips'
    | 'no-output-dir'
    | 'preflight-blocked'
    | 'invoke-failed';
}

interface StartApprovedRenderOptions {
  /**
   * Explicit batch scope. Every matching id renders regardless of review status;
   * omitted ids and every stored review decision remain untouched.
   */
  clipIds?: readonly string[];
}

interface SelectedRenderItems {
  regular: ClipCandidate[];
  stitched: StitchedClipCandidate[];
}

type PromoBrandAsset = NonNullable<
  NonNullable<Parameters<typeof window.api.startBatchRender>[0]['promo']>['brandAssets']
>[number];

export function buildPromoRenderOptions(
  state: AppState,
): NonNullable<Parameters<typeof window.api.startBatchRender>[0]['promo']> | undefined {
  if (!state.settings.promo.enabled) return undefined;
  const profile = getCreatorProfiles().find((item) => item.id === state.creatorProfile.profileId);
  const categoryByPath = new Map(
    state.promoPlan.beats.flatMap((beat) =>
      beat.evidenceAssetPath && beat.evidenceCategory !== 'none'
        ? [[beat.evidenceAssetPath, beat.evidenceCategory] as const]
        : [],
    ),
  );
  const evidenceAssets: PromoBrandAsset[] = (profile?.evidenceAssetPaths ?? []).map(
    (mediaPath, index) => ({
      id: `profile-evidence-${index}`,
      category: categoryByPath.get(mediaPath) ?? 'app-ui',
      mediaPath,
      tags: ['creator-profile', 'evidence'],
    }),
  );
  const ctaPath =
    state.promoPlan.ctaSource === 'none'
      ? null
      : state.promoPlan.ctaAssetPath &&
          profile?.callToAction.assetPaths.includes(state.promoPlan.ctaAssetPath)
        ? state.promoPlan.ctaAssetPath
        : (profile?.callToAction.assetPaths[0] ?? null);
  const ctaAsset = ctaPath
    ? ({
        id: 'profile-cta',
        category: 'cta',
        mediaPath: ctaPath,
        tags: ['creator-profile', 'cta'],
      } satisfies PromoBrandAsset)
    : null;
  return {
    enabled: true,
    forceCta: state.settings.promo.forceCta && state.promoPlan.ctaSource !== 'none',
    accentColor: state.settings.promo.accentColor,
    brandAssets: ctaAsset ? [...evidenceAssets, ctaAsset] : evidenceAssets,
    ...(ctaAsset ? { ctaAssetId: ctaAsset.id } : {}),
  };
}

function renderOptionsHash(state: AppState): string {
  return hashRenderOptions({
    outputMode: state.settings.outputMode,
    quality: state.settings.renderQuality,
    captions: {
      enabled: state.settings.captionsEnabled,
      mode: state.settings.captionMode,
      style: PRESTYJ_CAPTION_STYLE,
    },
    wordEmphasis: state.settings.wordEmphasisEnabled,
    shotTransitions: state.settings.shotTransitionsEnabled,
    explainerScenes: state.settings.explainerScenesEnabled,
    autoZoom: state.settings.autoZoom,
    hook: state.settings.hookTitleOverlay,
    rehook: state.settings.rehookOverlay,
    filler: state.settings.fillerRemoval,
    broll: state.settings.broll,
    promo: state.settings.promo,
    template: state.settings.templateLayout,
    palette: state.settings.longformPaletteId,
    skin: state.settings.longformSkin,
  });
}

function selectRenderItems(
  state: AppState,
  explicitIds?: readonly string[],
  preferPreparedQueue = false,
): SelectedRenderItems {
  const sourceId = state.activeSourceId;
  if (!sourceId) return { regular: [], stitched: [] };
  const allRegular = state.clips[sourceId] ?? [];
  const allStitched = state.stitchedClips[sourceId] ?? [];
  const preparedIds = preferPreparedQueue
    ? state.renderProgress
        .filter((item) => item.status === 'queued')
        .sort((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0))
        .map((item) => item.clipId)
    : [];
  const orderedIds = explicitIds ? [...explicitIds] : preparedIds;
  if (orderedIds.length > 0) {
    const regularById = new Map(allRegular.map((clip) => [clip.id, clip] as const));
    const stitchedById = new Map(allStitched.map((clip) => [clip.id, clip] as const));
    return {
      regular: orderedIds.flatMap((id) => {
        const item = regularById.get(id);
        return item ? [item] : [];
      }),
      stitched: orderedIds.flatMap((id) => {
        const item = stitchedById.get(id);
        return item ? [item] : [];
      }),
    };
  }
  return {
    regular: allRegular.filter((clip) => clip.status === 'approved'),
    stitched: allStitched.filter((clip) => clip.status === 'approved'),
  };
}

function queueRows(
  state: AppState,
  selected: SelectedRenderItems,
  estimates?: ReturnType<typeof estimateExport>,
): RenderProgress[] {
  const now = Date.now();
  const hash = renderOptionsHash(state);
  const combined = [
    ...selected.regular.map((clip) => ({
      clipId: clip.id,
      kind: 'clip' as const,
      label: clip.hookText || 'Untitled clip',
      sourceId: clip.sourceId,
      durationSeconds: clip.duration,
      requiresVisualAssets:
        clip.segments?.some((segment) =>
          ['split-image', 'fullscreen-image'].includes(segment.archetype),
        ) ?? false,
    })),
    ...selected.stitched.map((clip) => ({
      clipId: clip.id,
      kind: 'stitched' as const,
      label: clip.hookText || 'Stitched story',
      sourceId: clip.sourceId,
      durationSeconds: clip.duration,
      requiresVisualAssets:
        clip.segments?.some((segment) =>
          ['split-image', 'fullscreen-image'].includes(segment.archetype),
        ) ?? false,
    })),
  ];
  const totalDuration = combined.reduce((total, item) => total + item.durationSeconds, 0);
  return combined.map((item, index) => {
    const durationShare =
      totalDuration > 0 ? item.durationSeconds / totalDuration : 1 / combined.length;
    return {
      ...item,
      queuePosition: index,
      optionsHash: hash,
      percent: 0,
      status: 'queued' as const,
      checkpoints: [],
      queuedAt: now,
      ...(estimates
        ? {
            estimatedRenderSeconds: Math.max(
              1,
              Math.round(
                ((estimates.renderSecondsLow + estimates.renderSecondsHigh) / 2) * durationShare,
              ),
            ),
            estimatedSizeBytes: Math.max(
              1,
              Math.round(((estimates.sizeBytesLow + estimates.sizeBytesHigh) / 2) * durationShare),
            ),
          }
        : {}),
    };
  });
}

async function resolveOutputDirectory(): Promise<string | null> {
  const state = useStore.getState();
  if (state.settings.outputDirectory) return state.settings.outputDirectory;
  const outputDirectory = await window.api.getDefaultOutputDirectory().catch(() => null);
  if (!outputDirectory) return null;
  useStore.setState((draft) => {
    draft.settings.outputDirectory = outputDirectory;
  });
  return outputDirectory;
}

export async function prepareApprovedRender(
  options: StartApprovedRenderOptions = {},
): Promise<StartApprovedRenderResult> {
  const state = useStore.getState();
  const source = state.activeSourceId
    ? state.sources.find((candidate) => candidate.id === state.activeSourceId)
    : null;
  if (!source) return { started: false, reason: 'no-source' };
  if (source.mediaStatus === 'checking' || source.mediaStatus === 'offline') {
    toast.error(
      source.mediaStatus === 'checking'
        ? 'Wait for the source media check to finish'
        : 'Relink the source media before exporting',
    );
    return { started: false, reason: 'source-offline' };
  }
  const selected = selectRenderItems(state, options.clipIds);
  if (selected.regular.length === 0 && selected.stitched.length === 0) {
    toast.error(
      options.clipIds ? 'No clips are available for this export' : 'No approved clips to export',
    );
    return { started: false, reason: 'no-clips' };
  }
  const outputDirectory = await resolveOutputDirectory();
  if (!outputDirectory) return { started: false, reason: 'no-output-dir' };
  const encoder = await window.api.getEncoder().catch(() => null);
  const draftRows = queueRows(state, selected);
  const rows = queueRows(
    state,
    selected,
    estimateExport(draftRows, state.settings, 'short', encoder),
  );
  state.clearRenderErrors();
  state.setRenderProgress(rows);
  state.setRenderCancellation({ status: 'idle', error: null });
  state.setIsRendering(false);
  state.setPipeline({ stage: 'rendering', message: 'Review export preflight', percent: 0 });
  return { started: true };
}
export async function startApprovedRender(
  options: StartApprovedRenderOptions = {},
): Promise<StartApprovedRenderResult> {
  const state = useStore.getState();
  const {
    activeSourceId,
    sources,
    settings,
    setRenderProgress,
    setIsRendering,
    setRenderCancellation,
    setPipeline,
    clearRenderErrors,
    addError,
  } = state;

  const activeSource = activeSourceId
    ? (sources.find((source) => source.id === activeSourceId) ?? null)
    : null;

  if (!activeSource) {
    toast.error('No active source video');
    return { started: false, reason: 'no-source' };
  }
  if (activeSource.mediaStatus === 'checking' || activeSource.mediaStatus === 'offline') {
    toast.error(
      activeSource.mediaStatus === 'checking'
        ? 'Wait for the source media check to finish'
        : 'Relink the source media before rendering',
    );
    return { started: false, reason: 'source-offline' };
  }

  const selected = selectRenderItems(state, options.clipIds, options.clipIds === undefined);
  const renderClips = selected.regular;
  const renderStitched = selected.stitched;
  const preparedOrder = state.renderProgress
    .filter((item) => item.status === 'queued')
    .sort((left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0))
    .map((item) => item.clipId);
  const fallbackOrder = [...renderClips, ...renderStitched].map((clip) => clip.id);
  const scopeIds = options.clipIds
    ? [...options.clipIds]
    : preparedOrder.length > 0
      ? preparedOrder
      : fallbackOrder;
  const scope = new Set(scopeIds);
  if (renderClips.length === 0 && renderStitched.length === 0) {
    toast.error(
      options.clipIds ? 'No clips are available for this export' : 'No approved clips to render',
    );
    return { started: false, reason: 'no-clips' };
  }

  const outputDirectory = await resolveOutputDirectory();
  if (!outputDirectory) {
    toast.error('Couldn’t resolve a default output directory');
    return { started: false, reason: 'no-output-dir' };
  }

  const existingRows = state.renderProgress.filter((row) => scope.has(row.clipId));
  const rowsForCheck =
    existingRows.length === scope.size ? existingRows : queueRows(state, selected);
  const preflight = await runExportPreflight({
    destination: outputDirectory,
    sourcePaths: [activeSource.path],
    queue: rowsForCheck,
    settings,
    outputMode: 'short',
  });
  const blockers = preflight.issues.filter((issue) => issue.severity === 'blocker');
  if (blockers.length > 0) {
    const first = blockers[0];
    const error = addError({
      source: 'render',
      message: `${first?.title ?? 'Export preflight failed'}: ${first?.detail ?? 'Review the export setup.'}`,
      failedStage: 'rendering',
    });
    toast.error(error.headline);
    return { started: false, reason: 'preflight-blocked' };
  }

  clearRenderErrors();
  const queued = queueRows(state, selected, preflight.estimate)
    .sort((left, right) => scopeIds.indexOf(left.clipId) - scopeIds.indexOf(right.clipId))
    .map((item, queuePosition) => ({ ...item, queuePosition }));
  const preserved = state.renderProgress.filter((row) => !scope.has(row.clipId));
  setRenderProgress([...preserved, ...queued]);
  setRenderCancellation({ status: 'idle', error: null });
  setIsRendering(true);
  setPipeline({ stage: 'rendering', message: 'Preparing exports', percent: 0 });

  // ── Build B-roll options ─────────────────────────────────────────────────
  // The broll block is only forwarded when the feature is enabled AND a Pexels
  // key is present — without a key the render pipeline cannot fetch stock
  // footage and silently drops b-roll. When the user has b-roll on but no key,
  // warn them explicitly so they aren't surprised by a clip with no b-roll.
  const broll = settings.broll;
  const clipsRequestingBroll = [...renderClips, ...renderStitched].some(
    (clip) => clip.overrides?.enableBroll === true,
  );
  const brollRequested = broll.enabled || clipsRequestingBroll;
  if (brollRequested && !settings.pexelsApiKey) {
    toast.warning(
      'B-roll is on but no Pexels key is set — rendering without b-roll. Add a key in Settings.',
    );
  }
  const brollOptions =
    brollRequested && (settings.pexelsApiKey || false)
      ? {
          enabled: true,
          pexelsApiKey: settings.pexelsApiKey,
          intervalSeconds: broll.intervalSeconds,
          clipDuration: broll.clipDuration,
          displayMode: broll.displayMode,
          transition: broll.transition,
          pipSize: broll.pipSize,
          pipPosition: broll.pipPosition,
        }
      : undefined;

  // ── Build Promo Mode options ─────────────────────────────────────────────
  // Promo Mode owns the overlay layer when active and takes precedence over
  // stock B-Roll (see the Phase 1a block in render-handlers.ts). Only forward
  // the block when enabled so the main side's default path is untouched.
  const promoOptions = buildPromoRenderOptions(state);

  try {
    await window.api.startBatchRender({
      outputDirectory,
      renderConcurrency: settings.renderConcurrency,
      renderQuality: settings.renderQuality,
      outputAspectRatio: settings.outputAspectRatio,
      filenameTemplate: settings.filenameTemplate,
      developerMode: settings.developerMode,

      // ── Captions (V2: 3 modes, single builder) ─────────────────────────
      // Without captionStyle the captions feature short-circuits and
      // produces no subtitles, so we always send the PRESTYJ defaults.
      captionsEnabled: settings.captionsEnabled,
      captionStyle: {
        ...PRESTYJ_CAPTION_STYLE,
        captionMode: settings.captionMode,
      },
      wordEmphasisEnabled: settings.wordEmphasisEnabled,
      shotTransitionsEnabled: settings.shotTransitionsEnabled,
      explainerScenesEnabled: settings.explainerScenesEnabled,
      hyperframesEnabled: settings.promo.enabled,

      // ── Visual features ─────────────────────────────────────────────
      autoZoom: settings.autoZoom,
      hookTitleOverlay: settings.hookTitleOverlay,
      rehookOverlay: settings.rehookOverlay,
      fillerRemoval: settings.fillerRemoval,
      broll: brollOptions,
      promo: promoOptions,

      // ── Template layout (Template Editor: subtitle + hook position) ─────
      // The render pipeline reads only `subtitles.y` and `titleText.y`; the
      // x coordinates are forwarded for forward-compat. `rehookText` mirrors
      // `titleText` so the mid-clip pattern interrupt sits where the user
      // placed the hook.
      templateLayout: {
        titleText: settings.templateLayout.titleText,
        subtitles: settings.templateLayout.subtitles,
        rehookText: settings.templateLayout.titleText,
      },

      // ── AI / external service keys ─────────────────────────────────────
      // Required for B-roll keyword extraction & AI image generation, plus
      // segment-image generation in the segmented render path.
      geminiApiKey: settings.geminiApiKey,
      pexelsApiKey: settings.pexelsApiKey,

      sourceMeta: {
        name: activeSource.name,
        path: activeSource.path,
        duration: activeSource.duration,
      },
      jobs: (
        [
          ...renderClips.map((c) => ({
            clipId: c.id,
            sourceVideoPath: activeSource.path,
            startTime: c.startTime,
            endTime: c.endTime,
            cropRegion: c.cropRegion
              ? {
                  x: c.cropRegion.x,
                  y: c.cropRegion.y,
                  width: c.cropRegion.width,
                  height: c.cropRegion.height,
                }
              : undefined,
            cropTimeline: c.cropTimeline,
            wordTimestamps: c.wordTimestamps,
            hookTitleText: c.hookText,
            rehookText: c.overrides?.rehookText,
            // Per-clip overrides edited in ClipDetail (caption mode, etc.).
            // Absent keys fall back to the global render settings on the main
            // side, so we forward the override object as-is when present.
            clipOverrides: c.overrides,
            // Per-segment archetype rotation produced by the segmenting stage.
            // Falsy zoomStyle/zoomIntensity are filled in by resolveTemplate() on
            // the main side, so we just forward what the styler produced.
            segmentedSegments:
              c.segments && c.segments.length > 0
                ? c.segments.map((s) => ({
                    id: s.id,
                    captionText: s.captionText,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    archetype: s.archetype,
                    transitionIn: s.transitionIn,
                    imagePath: s.imagePath,
                  }))
                : undefined,
          })),
          // Stitched clips — the render pipeline’s stitched pre-pass assembles
          // the ranges into a single MP4 and rewrites the job to look like a
          // regular clip on the assembled timeline. segmentedSegments here are
          // already clip-local (built by stitchedSegmentingPass) so they line
          // up perfectly after assembly.
          ...renderStitched.map((sc) => ({
            clipId: sc.id,
            sourceVideoPath: activeSource.path,
            startTime: Math.min(...sc.sourceRanges.map((r) => r.startTime)),
            endTime: Math.max(...sc.sourceRanges.map((r) => r.endTime)),
            cropRegion: sc.cropRegion
              ? {
                  x: sc.cropRegion.x,
                  y: sc.cropRegion.y,
                  width: sc.cropRegion.width,
                  height: sc.cropRegion.height,
                }
              : undefined,
            wordTimestamps: sc.wordTimestamps,
            hookTitleText: sc.hookText,
            rehookText: sc.overrides?.rehookText,
            clipOverrides: sc.overrides,
            stitchedSegments: sc.sourceRanges.map((r, i) => ({
              startTime: r.startTime,
              endTime: r.endTime,
              role: r.role,
              cropRect: sc.rangeCropRects?.[i],
            })),
            segmentedSegments:
              sc.segments && sc.segments.length > 0
                ? sc.segments.map((s) => ({
                    id: s.id,
                    captionText: s.captionText,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    archetype: s.archetype,
                    transitionIn: s.transitionIn,
                    imagePath: s.imagePath,
                  }))
                : undefined,
          })),
        ] as Parameters<typeof window.api.startBatchRender>[0]['jobs']
      ).sort((left, right) => scopeIds.indexOf(left.clipId) - scopeIds.indexOf(right.clipId)),
    });
    return { started: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setIsRendering(false);
    setPipeline({ stage: 'error', message: msg, percent: 0 });
    const error = addError({
      source: 'render',
      message: `Couldn't start render: ${msg}`,
      failedStage: 'rendering',
    });
    toast.error(error.headline);
    return { started: false, reason: 'invoke-failed' };
  }
}
