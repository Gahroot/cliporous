import { DEFAULT_SUBTITLE_POSITION } from '@shared/caption-layout';
import { DEFAULT_FILENAME_TEMPLATE, DEFAULT_MIN_SCORE } from '@shared/constants';
import type { CreatorJob } from '@shared/jobs';
import { DEFAULT_PALETTE_ID } from '@shared/palettes';
import {
  DEFAULT_AUTOSAVE_INTERVAL_MS,
  PROJECT_SCHEMA_VERSION,
  type ProjectIdentity,
  type RecoverySnapshotMetadata,
} from '@shared/project';
import type {
  AppSettings,
  BRollSettings,
  CaptionMode,
  ClipCandidate,
  CreativeBrief,
  CreatorPresetId,
  FillerRemovalSettings,
  HookTitleOverlaySettings,
  PipelineStage,
  Platform,
  ProcessingConfig,
  ProjectCreatorProfile,
  ProjectWorkspace,
  PromoProjectPlan,
  PromoSettings,
  RehookOverlaySettings,
  RenderProgress,
  RenderQualitySettings,
  SourceVideo,
  StitchedClipCandidate,
  TemplateLayout,
  TranscriptionData,
  ZoomSettings,
} from './types';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Update a single item by ID in an array of objects.
 * Accepts either a partial object or a function that receives the current item
 * and returns a partial update.
 */
export function updateItemById<T extends { id: string }>(
  items: T[],
  itemId: string,
  update: Partial<T> | ((item: T) => Partial<T>),
): T[] {
  return items.map((item) =>
    item.id === itemId
      ? { ...item, ...(typeof update === 'function' ? update(item) : update) }
      : item,
  );
}

// ---------------------------------------------------------------------------
// Default settings values
// ---------------------------------------------------------------------------

export const DEFAULT_CREATOR_PRESET: CreatorPresetId = 'signature';
export const DEFAULT_CAPTION_MODE: CaptionMode = 'emphasis_highlight';

export const DEFAULT_AUTO_ZOOM: ZoomSettings = {
  enabled: true,
  mode: 'ken-burns',
  intensity: 'subtle',
  intervalSeconds: 4,
};

export const DEFAULT_HOOK_TITLE_OVERLAY: HookTitleOverlaySettings = {
  enabled: true,
  style: 'centered-bold',
  displayDuration: 2.5,
  fadeIn: 0.3,
  fadeOut: 0.4,
  fontSize: 72,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 4,
};

export const DEFAULT_REHOOK_OVERLAY: RehookOverlaySettings = {
  enabled: true,
  style: 'bar',
  displayDuration: 1.5,
  fadeIn: 0.2,
  fadeOut: 0.3,
  positionFraction: 0.45,
};

export const DEFAULT_BROLL: BRollSettings = {
  enabled: false,
  intervalSeconds: 5,
  clipDuration: 3,
  displayMode: 'split-top',
  transition: 'crossfade',
  pipSize: 0.25,
  pipPosition: 'bottom-right',
};

/** PRESTYJ violet — the default promo evidence accent color. */
export const DEFAULT_PROMO: PromoSettings = {
  enabled: false,
  forceCta: true,
  accentColor: '#9f75ff',
};

/**
 * "Let It Ride" preset — the default. Trims only obvious hesitation sounds
 * (um, uh, etc.) and pauses longer than 1.5 s. Keeps 0.6 s of each long pause
 * plus render-side breath padding, prioritising coherence over pace.
 */
export const FILLER_PRESET_LET_IT_RIDE: FillerRemovalSettings = {
  enabled: true,
  preset: 'let-it-ride',
  removeFillerWords: true,
  trimSilences: true,
  removeRepeats: true,
  silenceThreshold: 1.5,
  silenceTargetGap: 0.6,
  fillerWords: ['um', 'uh', 'erm', 'er', 'ah', 'hm', 'hmm', 'mm', 'mhm'],
};

/**
 * "Tight" preset — cuts hesitation + discourse markers + short pauses.
 * Suited to short hook-driven clips where every second matters. May break
 * sentence prosody on thoughtful long-form delivery.
 */
export const FILLER_PRESET_TIGHT: FillerRemovalSettings = {
  enabled: true,
  preset: 'tight',
  removeFillerWords: true,
  trimSilences: true,
  removeRepeats: true,
  silenceThreshold: 0.8,
  silenceTargetGap: 0.15,
  fillerWords: [
    'um',
    'uh',
    'erm',
    'er',
    'ah',
    'hm',
    'hmm',
    'mm',
    'mhm',
    'like',
    'you know',
    'i mean',
    'sort of',
    'kind of',
    'basically',
    'actually',
    'literally',
    'right',
    'okay so',
  ],
};

export const DEFAULT_FILLER_REMOVAL: FillerRemovalSettings = FILLER_PRESET_LET_IT_RIDE;

/**
 * Resolve a saved filler-removal config from an older (pre-preset) schema
 * into the new shape.
 *
 * Behaviour:
 *  1. Saved named presets adopt current canonical tuning while preserving the
 *     enabled toggle; custom values remain untouched.
 *  2. No `preset` field AND values match the old aggressive auto-saved
 *     defaults exactly → silently upgrade to "Let It Ride" (the user never
 *     made an explicit choice; the app's default just changed).
 *  3. No `preset` field but values differ → preserve as "custom" so user
 *     tweaks survive the upgrade.
 */
export function migrateFillerRemoval(
  saved: Partial<FillerRemovalSettings> | undefined,
): FillerRemovalSettings {
  if (!saved) return { ...FILLER_PRESET_LET_IT_RIDE };

  if (saved.preset === 'tight') {
    return { ...FILLER_PRESET_TIGHT, enabled: saved.enabled ?? true };
  }
  if (saved.preset === 'let-it-ride') {
    return { ...FILLER_PRESET_LET_IT_RIDE, enabled: saved.enabled ?? true };
  }
  if (saved.preset === 'custom') {
    return { ...FILLER_PRESET_LET_IT_RIDE, ...saved, preset: 'custom' };
  }

  // Legacy schema (no preset field). Detect users who were on the old
  // auto-saved aggressive defaults so we can quietly migrate them to the new
  // "Let It Ride" defaults instead of leaving them stuck with the choppy
  // behaviour their localStorage was holding onto.
  const isOldAutoSavedDefault =
    saved.silenceThreshold === 0.8 &&
    saved.removeFillerWords === true &&
    saved.trimSilences === true &&
    saved.removeRepeats === true &&
    Array.isArray(saved.fillerWords) &&
    saved.fillerWords.length === 19 &&
    saved.fillerWords.includes('like') &&
    saved.fillerWords.includes('basically');

  if (isOldAutoSavedDefault) {
    return { ...FILLER_PRESET_LET_IT_RIDE, enabled: saved.enabled ?? true };
  }

  // Otherwise the user (or test fixture) had deliberately tweaked something
  // — keep their values and surface them as "custom".
  return {
    ...FILLER_PRESET_LET_IT_RIDE,
    ...saved,
    preset: 'custom',
  };
}

export const DEFAULT_RENDER_QUALITY: RenderQualitySettings = {
  preset: 'normal',
  customCrf: 20,
  outputResolution: '1080x1920',
  outputFormat: 'mp4',
  encodingPreset: 'medium',
};

/**
 * Template layout defaults — percent-of-canvas (0–100) coordinates for the
 * centre of each repositionable overlay. Hook title sits in the upper third,
 * subtitles ride the lower band above the platform UI dead-zones.
 */
export const DEFAULT_TEMPLATE_LAYOUT: TemplateLayout = {
  titleText: { x: 50, y: 18 },
  subtitles: { ...DEFAULT_SUBTITLE_POSITION },
};

export const DEFAULT_TARGET_PLATFORM: Platform = 'universal';

export const DEFAULT_SETTINGS: AppSettings = {
  // API keys are loaded asynchronously from Electron safeStorage via
  // `hydrateSecretsFromMain()`. They default to empty strings here so the
  // store has a valid synchronous initial shape.
  geminiApiKey: '',
  falApiKey: '',
  pexelsApiKey: '',
  outputDirectory: null,
  autosaveIntervalMs: DEFAULT_AUTOSAVE_INTERVAL_MS,
  minScore: DEFAULT_MIN_SCORE,
  creatorPreset: DEFAULT_CREATOR_PRESET,
  captionsEnabled: true,
  captionMode: DEFAULT_CAPTION_MODE,
  wordEmphasisEnabled: true,
  shotTransitionsEnabled: true,
  autoZoom: DEFAULT_AUTO_ZOOM,
  hookTitleOverlay: DEFAULT_HOOK_TITLE_OVERLAY,
  rehookOverlay: DEFAULT_REHOOK_OVERLAY,
  broll: DEFAULT_BROLL,
  promo: DEFAULT_PROMO,
  fillerRemoval: DEFAULT_FILLER_REMOVAL,
  enableNotifications: true,
  developerMode: false,
  renderQuality: DEFAULT_RENDER_QUALITY,
  outputAspectRatio: '9:16',
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  renderConcurrency: 1,
  templateLayout: DEFAULT_TEMPLATE_LAYOUT,
  targetPlatform: DEFAULT_TARGET_PLATFORM,
  outputMode: 'short',
  longformSkin: 'editorial',
  longformPaletteId: DEFAULT_PALETTE_ID,
  customPalettes: [],
};

export const DEFAULT_TARGET_AUDIENCE = '';

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  targetDuration: 'auto',
  enablePerfectLoop: false,
  clipEndMode: 'loop-first',
  enableMultiPart: false,
  enableAiEdit: true,
  targetAudience: DEFAULT_TARGET_AUDIENCE,
  promoMode: false,
};

export const DEFAULT_PIPELINE = {
  stage: 'idle' as const,
  message: '',
  percent: 0,
};

// ---------------------------------------------------------------------------
// Project file schema
// ---------------------------------------------------------------------------

export { PROJECT_SCHEMA_VERSION };

/**
 * Settings that belong to one content project. Credentials, output-folder
 * defaults, notifications, developer mode, render concurrency, and the reusable
 * profile library stay app-scoped and never enter project files.
 */
export type ProjectSettings = Pick<
  AppSettings,
  | 'minScore'
  | 'creatorPreset'
  | 'captionsEnabled'
  | 'captionMode'
  | 'wordEmphasisEnabled'
  | 'shotTransitionsEnabled'
  | 'autoZoom'
  | 'hookTitleOverlay'
  | 'rehookOverlay'
  | 'broll'
  | 'promo'
  | 'fillerRemoval'
  | 'renderQuality'
  | 'outputAspectRatio'
  | 'filenameTemplate'
  | 'templateLayout'
  | 'targetPlatform'
  | 'outputMode'
>;

/** Canonical versioned shape written to / read from .batchclip files. */
export interface ProjectFileData {
  version: typeof PROJECT_SCHEMA_VERSION;
  identity: ProjectIdentity;
  sources: SourceVideo[];
  transcriptions: Record<string, TranscriptionData>;
  clips: Record<string, ClipCandidate[]>;
  /** Stitched (multi-range) clip candidates keyed by source ID. */
  stitchedClips?: Record<string, StitchedClipCandidate[]>;
  /**
   * Long-form (16:9) edit plans keyed by source ID. Persisted so a saved /
   * recovered long-form project can re-render without re-paying the Gemini
   * `longformEditPlan` call. Optional for back-compat with older project files.
   */
  longformPlans?: Record<string, import('./longform-slice').LongformPlanRecord>;
  settings: ProjectSettings;
  processingConfig?: ProcessingConfig;
  /** Exact creator workspace restored when the project reopens. */
  /** Exact creator workspace restored when the project reopens. */
  workspace?: ProjectWorkspace;
  creativeBrief?: CreativeBrief;
  creatorProfile?: ProjectCreatorProfile;
  promoPlan?: PromoProjectPlan;
  /** Last safe processing checkpoint. Active work reopens paused and explicitly resumable. */
  processingState?: {
    job: CreatorJob;
    completedStages: PipelineStage[];
    cachedSourcePath: string | null;
  };
  /** Durable queue rows and completed output paths. Active encoders restart as queued. */
  renderState?: {
    progress: RenderProgress[];
    startedAt: number | null;
    completedAt: number | null;
  };
  /** Present only in the dedicated crash-recovery autosave. */
  recovery?: RecoverySnapshotMetadata;
}

// ---------------------------------------------------------------------------
// Settings Persistence
// ---------------------------------------------------------------------------

const SETTINGS_STORAGE_KEY = 'batchclip-settings';
const PROCESSING_CONFIG_STORAGE_KEY = 'batchclip-processing-config';

export function loadPersistedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        // Gemini / Pexels keys + output directory are hydrated asynchronously
        // from safeStorage by hydrateSecretsFromMain(). Always start empty so
        // a stale localStorage value can't shadow the safeStorage source of
        // truth (where the Settings window writes them).
        geminiApiKey: '',
        pexelsApiKey: '',
        outputDirectory: null,
        falApiKey: '',
        creatorPreset: saved.creatorPreset ?? DEFAULT_CREATOR_PRESET,
        captionsEnabled: saved.captionsEnabled ?? true,
        captionMode: saved.captionMode ?? DEFAULT_CAPTION_MODE,
        wordEmphasisEnabled: saved.wordEmphasisEnabled ?? true,
        shotTransitionsEnabled: saved.shotTransitionsEnabled ?? true,
        autoZoom: { ...DEFAULT_AUTO_ZOOM, ...(saved.autoZoom ?? {}) },
        hookTitleOverlay: { ...DEFAULT_HOOK_TITLE_OVERLAY, ...(saved.hookTitleOverlay ?? {}) },
        rehookOverlay: { ...DEFAULT_REHOOK_OVERLAY, ...(saved.rehookOverlay ?? {}) },
        broll: { ...DEFAULT_BROLL, ...(saved.broll ?? {}) },
        promo: { ...DEFAULT_PROMO, ...(saved.promo ?? {}) },
        fillerRemoval: migrateFillerRemoval(saved.fillerRemoval),
        renderQuality: { ...DEFAULT_RENDER_QUALITY, ...(saved.renderQuality ?? {}) },
        templateLayout: {
          titleText: {
            ...DEFAULT_TEMPLATE_LAYOUT.titleText,
            ...(saved.templateLayout?.titleText ?? {}),
          },
          subtitles: {
            ...DEFAULT_TEMPLATE_LAYOUT.subtitles,
            ...(saved.templateLayout?.subtitles ?? {}),
          },
        },
        targetPlatform: saved.targetPlatform ?? DEFAULT_TARGET_PLATFORM,
        longformPaletteId: saved.longformPaletteId ?? DEFAULT_PALETTE_ID,
        customPalettes: Array.isArray(saved.customPalettes) ? saved.customPalettes : [],
      };
    }
  } catch {
    // JSON parse error — fall back to defaults
  }
  return DEFAULT_SETTINGS;
}

export function loadPersistedProcessingConfig(): ProcessingConfig {
  try {
    const raw = localStorage.getItem(PROCESSING_CONFIG_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ProcessingConfig>;
      return { ...DEFAULT_PROCESSING_CONFIG, ...saved };
    }
  } catch {
    // JSON parse error — fall back to defaults
  }
  return DEFAULT_PROCESSING_CONFIG;
}

export function persistSettings(settings: AppSettings): void {
  try {
    // Strip values that live in safeStorage (the Settings window's source of
    // truth) so we don't double-write them to plaintext localStorage.
    const {
      geminiApiKey: _g,
      falApiKey: _f,
      pexelsApiKey: _p,
      outputDirectory: _o,
      ...rest
    } = settings;
    void _g;
    void _f;
    void _p;
    void _o;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function persistProcessingConfig(config: ProcessingConfig): void {
  try {
    localStorage.setItem(PROCESSING_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}
