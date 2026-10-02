import { registerCredentialValue } from '@shared/credential-safety';
import { clampAutosaveInterval, DEFAULT_AUTOSAVE_INTERVAL_MS } from '@shared/project';
import { normalizeStoryboardStyle } from '@shared/storyboards';
import type { StateCreator } from 'zustand';
import {
  DEFAULT_PROCESSING_CONFIG,
  DEFAULT_SETTINGS,
  DEFAULT_TARGET_PLATFORM,
  DEFAULT_TEMPLATE_LAYOUT,
  FILLER_PRESET_LET_IT_RIDE,
  FILLER_PRESET_TIGHT,
  loadPersistedProcessingConfig,
  loadPersistedSettings,
} from './helpers';
import { _pushUndo } from './history-slice';
import type {
  AppSettings,
  AppState,
  BRollDisplayMode,
  BRollTransition,
  CaptionMode,
  CreatorPresetId,
  FillerRemovalPreset,
  HookTitleStyle,
  OutputAspectRatio,
  Platform,
  ProcessingConfig,
  RehookStyle,
  RenderQualitySettings,
  TemplateLayout,
  ZoomIntensity,
  ZoomMode,
} from './types';

// ---------------------------------------------------------------------------
// Settings Slice
// ---------------------------------------------------------------------------

export interface SettingsSlice {
  settings: AppSettings;
  processingConfig: ProcessingConfig;

  /** Hydrate API keys from main-process encrypted store (safeStorage). */
  hydrateSecretsFromMain: () => Promise<void>;

  // Settings setters
  setGeminiApiKey: (key: string) => void;
  setFalApiKey: (key: string) => void;
  setOutputDirectory: (dir: string) => void;
  setMinScore: (score: number) => void;
  applyCreatorPreset: (preset: Exclude<CreatorPresetId, 'custom'>) => void;
  setCreatorPresetCustom: () => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  setCaptionMode: (mode: CaptionMode) => void;
  setWordEmphasisEnabled: (enabled: boolean) => void;
  setShotTransitionsEnabled: (enabled: boolean) => void;
  setAutoZoomEnabled: (enabled: boolean) => void;
  setAutoZoomMode: (mode: ZoomMode) => void;
  setAutoZoomIntensity: (intensity: ZoomIntensity) => void;
  setAutoZoomInterval: (seconds: number) => void;
  setHookTitleEnabled: (enabled: boolean) => void;
  setHookTitleStyle: (style: HookTitleStyle) => void;
  setHookTitleDisplayDuration: (seconds: number) => void;
  setHookTitleFontSize: (px: number) => void;
  setHookTitleTextColor: (color: string) => void;
  setHookTitleOutlineColor: (color: string) => void;
  setHookTitleOutlineWidth: (px: number) => void;
  setHookTitleFadeIn: (seconds: number) => void;
  setHookTitleFadeOut: (seconds: number) => void;
  setRehookEnabled: (enabled: boolean) => void;
  setRehookStyle: (style: RehookStyle) => void;
  setRehookDisplayDuration: (seconds: number) => void;
  setRehookPositionFraction: (fraction: number) => void;
  setBRollEnabled: (enabled: boolean) => void;
  setBRollIntervalSeconds: (seconds: number) => void;
  setBRollClipDuration: (seconds: number) => void;
  setBRollDisplayMode: (mode: BRollDisplayMode) => void;
  setBRollTransition: (transition: BRollTransition) => void;
  setBRollPipSize: (size: number) => void;
  setBRollPipPosition: (
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  ) => void;
  setPromoEnabled: (enabled: boolean) => void;
  setPromoForceCta: (forceCta: boolean) => void;
  setPromoAccentColor: (color: string) => void;
  setFillerRemovalEnabled: (enabled: boolean) => void;
  setFillerRemovalPreset: (preset: FillerRemovalPreset) => void;
  setFillerRemovalFillerWords: (enabled: boolean) => void;
  setFillerRemovalSilences: (enabled: boolean) => void;
  setFillerRemovalRepeats: (enabled: boolean) => void;
  setFillerRemovalSilenceThreshold: (seconds: number) => void;
  setFillerRemovalSilenceTargetGap: (seconds: number) => void;
  setFillerRemovalWordList: (words: string[]) => void;
  setEnableNotifications: (enabled: boolean) => void;
  setDeveloperMode: (enabled: boolean) => void;
  setRenderQuality: (quality: Partial<RenderQualitySettings>) => void;
  setOutputAspectRatio: (ratio: OutputAspectRatio) => void;
  setFilenameTemplate: (template: string) => void;
  setRenderConcurrency: (concurrency: number) => void;
  setOutputMode: (mode: import('./types').OutputMode) => void;
  setLongformSkin: (skin: import('./types').LongformSkinId) => void;
  setLongformStoryboardStyle: AppState['setLongformStoryboardStyle'];
  setLongformPaletteId: (id: string) => void;
  addCustomPalette: (palette: import('./types').Palette) => void;
  updateCustomPalette: (id: string, patch: Partial<import('./types').Palette>) => void;
  removeCustomPalette: (id: string) => void;

  // Template layout (on-screen text positioning)
  setTemplateLayout: (layout: TemplateLayout) => void;
  setTargetPlatform: (platform: Platform) => void;
  resetTemplateLayout: () => void;

  resetSettings: () => void;
  resetSection: (
    section:
      | 'autoZoom'
      | 'hookTitle'
      | 'rehook'
      | 'fillerRemoval'
      | 'broll'
      | 'promo'
      | 'aiSettings'
      | 'renderQuality',
  ) => void;

  // Processing config
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void;
  resetProcessingConfig: () => void;
}

export const createSettingsSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  SettingsSlice
> = (set, get) => ({
  settings: loadPersistedSettings(),
  processingConfig: loadPersistedProcessingConfig(),

  // --- Secrets hydration (migration + async load) ---

  hydrateSecretsFromMain: async () => {
    const secrets = window.api?.secrets;
    if (!secrets) return;

    // One-time migration from legacy plaintext localStorage entries into safeStorage.
    const migrations: Array<[secretName: string, legacyKey: string]> = [
      ['gemini', 'batchclip-gemini-key'],
      ['fal', 'batchclip-fal-key'],
    ];
    await Promise.all(
      migrations.map(async ([name, legacyKey]) => {
        const legacy = localStorage.getItem(legacyKey);
        if (!legacy) return;
        try {
          await secrets.set(name, legacy);
          localStorage.removeItem(legacyKey);
        } catch (err) {
          console.warn(`[secrets] Failed to migrate legacy ${name} key:`, err);
        }
      }),
    );

    try {
      const [gemini, fal, pexels, outputDirectory, autosaveInterval] = await Promise.all([
        secrets.get('gemini'),
        secrets.get('fal'),
        secrets.get('pexels'),
        secrets.get('outputDirectory'),
        secrets.get('autosaveIntervalMs'),
      ]);
      // Zero-config floor: when the user has never picked an output folder, seed
      // the store with the app-wide default (<OS Videos>/BatchClip) so rendering
      // works without ever opening Settings. We don't persist this back to
      // safeStorage — the Settings secret stays empty ("falls back to system
      // default") and an explicit user choice still overrides it.
      const trimmed = (outputDirectory ?? '').trim();
      const resolvedOutputDir =
        trimmed.length > 0
          ? trimmed
          : ((await window.api?.getDefaultOutputDirectory?.().catch(() => null)) ?? null);

      registerCredentialValue(gemini);
      registerCredentialValue(fal);
      registerCredentialValue(pexels);
      set((state) => {
        if (gemini) state.settings.geminiApiKey = gemini;
        if (fal) state.settings.falApiKey = fal;
        if (pexels) state.settings.pexelsApiKey = pexels;
        // outputDirectory is intentionally allowed to overwrite to null/empty
        // so removing it in the Settings window propagates to the main window;
        // the default seed above keeps rendering functional in that case.
        state.settings.outputDirectory = resolvedOutputDir;
        state.settings.autosaveIntervalMs = clampAutosaveInterval(
          autosaveInterval === null
            ? DEFAULT_AUTOSAVE_INTERVAL_MS
            : Number.parseInt(autosaveInterval, 10),
        );
      });
    } catch (err) {
      console.warn('[secrets] Failed to hydrate secrets from main:', err);
    }
  },

  // --- Settings ---

  setGeminiApiKey: (key) => {
    registerCredentialValue(key);
    void window.api?.secrets?.set('gemini', key);
    set((state) => {
      state.settings.geminiApiKey = key;
    });
  },

  setFalApiKey: (key) => {
    registerCredentialValue(key);
    void window.api?.secrets?.set('fal', key);
    set((state) => {
      state.settings.falApiKey = key;
    });
  },

  setOutputDirectory: (dir) => {
    // Persist to safeStorage so the Settings window (separate BrowserWindow)
    // sees the same value. Settings window reads/writes the same secret key.
    void window.api?.secrets?.set('outputDirectory', dir ?? '');
    set((state) => {
      state.settings.outputDirectory = dir;
    });
  },

  setMinScore: (score) => {
    _pushUndo(get(), set, {
      label: 'minimum score',
      undoMessage: 'Minimum score restored',
      redoMessage: 'Minimum score change restored',
    });
    set((state) => {
      state.settings.minScore = score;
    });
  },

  applyCreatorPreset: (preset) =>
    set((state) => {
      state.settings.creatorPreset = preset;
      state.settings.promo.enabled = false;
      if (preset === 'clean') {
        state.settings.captionsEnabled = true;
        state.settings.captionMode = 'standard';
        state.settings.wordEmphasisEnabled = false;
        state.settings.shotTransitionsEnabled = false;
        state.settings.explainerScenesEnabled = false;
        state.settings.fillerRemoval = { ...FILLER_PRESET_LET_IT_RIDE, enabled: true };
        state.settings.hookTitleOverlay.enabled = false;
        state.settings.rehookOverlay.enabled = false;
        state.settings.autoZoom = { ...state.settings.autoZoom, enabled: false };
        state.settings.broll.enabled = false;
        return;
      }
      if (preset === 'signature') {
        state.settings.captionsEnabled = true;
        state.settings.captionMode = 'editorial';
        state.settings.wordEmphasisEnabled = true;
        state.settings.shotTransitionsEnabled = true;
        state.settings.explainerScenesEnabled = true;
        state.settings.fillerRemoval = { ...FILLER_PRESET_LET_IT_RIDE, enabled: true };
        state.settings.hookTitleOverlay.enabled = true;
        state.settings.rehookOverlay.enabled = true;
        state.settings.autoZoom = {
          ...state.settings.autoZoom,
          enabled: true,
          mode: 'ken-burns',
          intensity: 'subtle',
          intervalSeconds: 4,
        };
        state.settings.broll.enabled = false;
        return;
      }
      state.settings.captionsEnabled = true;
      state.settings.captionMode = 'editorial';
      state.settings.wordEmphasisEnabled = true;
      state.settings.shotTransitionsEnabled = true;
      state.settings.explainerScenesEnabled = true;
      state.settings.fillerRemoval = { ...FILLER_PRESET_TIGHT, enabled: true };
      state.settings.hookTitleOverlay.enabled = true;
      state.settings.rehookOverlay.enabled = true;
      state.settings.autoZoom = {
        ...state.settings.autoZoom,
        enabled: true,
        mode: 'reactive',
        intensity: 'medium',
        intervalSeconds: 3,
      };
      state.settings.broll.enabled = true;
    }),

  setCreatorPresetCustom: () =>
    set((state) => {
      state.settings.creatorPreset = 'custom';
    }),

  setCaptionsEnabled: (enabled) =>
    set((state) => {
      state.settings.captionsEnabled = enabled;
      state.settings.creatorPreset = 'custom';
    }),

  setCaptionMode: (captionMode) =>
    set((state) => {
      state.settings.captionMode = captionMode;
      state.settings.creatorPreset = 'custom';
    }),

  setWordEmphasisEnabled: (enabled) =>
    set((state) => {
      state.settings.wordEmphasisEnabled = enabled;
      state.settings.creatorPreset = 'custom';
    }),

  setShotTransitionsEnabled: (enabled) =>
    set((state) => {
      state.settings.shotTransitionsEnabled = enabled;
      state.settings.creatorPreset = 'custom';
    }),

  setAutoZoomEnabled: (enabled) =>
    set((state) => {
      state.settings.autoZoom.enabled = enabled;
      state.settings.creatorPreset = 'custom';
    }),

  setAutoZoomMode: (mode) =>
    set((state) => {
      state.settings.autoZoom.mode = mode;
    }),

  setAutoZoomIntensity: (intensity) =>
    set((state) => {
      state.settings.autoZoom.intensity = intensity;
    }),

  setAutoZoomInterval: (intervalSeconds) =>
    set((state) => {
      state.settings.autoZoom.intervalSeconds = intervalSeconds;
    }),

  // --- Hook Title Overlay ---

  setHookTitleEnabled: (enabled) =>
    set((state) => {
      state.settings.hookTitleOverlay.enabled = enabled;
    }),

  setHookTitleStyle: (style) =>
    set((state) => {
      state.settings.hookTitleOverlay.style = style;
    }),

  setHookTitleDisplayDuration: (displayDuration) =>
    set((state) => {
      state.settings.hookTitleOverlay.displayDuration = displayDuration;
    }),

  setHookTitleFontSize: (fontSize) =>
    set((state) => {
      state.settings.hookTitleOverlay.fontSize = fontSize;
    }),

  setHookTitleTextColor: (textColor) =>
    set((state) => {
      state.settings.hookTitleOverlay.textColor = textColor;
    }),

  setHookTitleOutlineColor: (outlineColor) =>
    set((state) => {
      state.settings.hookTitleOverlay.outlineColor = outlineColor;
    }),

  setHookTitleOutlineWidth: (outlineWidth) =>
    set((state) => {
      state.settings.hookTitleOverlay.outlineWidth = outlineWidth;
    }),

  setHookTitleFadeIn: (fadeIn) =>
    set((state) => {
      state.settings.hookTitleOverlay.fadeIn = fadeIn;
    }),

  setHookTitleFadeOut: (fadeOut) =>
    set((state) => {
      state.settings.hookTitleOverlay.fadeOut = fadeOut;
    }),

  // --- Re-hook Overlay ---

  setRehookEnabled: (enabled) =>
    set((state) => {
      state.settings.rehookOverlay.enabled = enabled;
    }),

  setRehookStyle: (style) =>
    set((state) => {
      state.settings.rehookOverlay.style = style;
    }),

  setRehookDisplayDuration: (displayDuration) =>
    set((state) => {
      state.settings.rehookOverlay.displayDuration = displayDuration;
    }),

  setRehookPositionFraction: (positionFraction) =>
    set((state) => {
      state.settings.rehookOverlay.positionFraction = positionFraction;
    }),

  // --- B-Roll ---

  setBRollEnabled: (enabled) =>
    set((state) => {
      state.settings.broll.enabled = enabled;
      if (enabled) state.settings.promo.enabled = false;
      state.settings.creatorPreset = 'custom';
    }),

  setBRollIntervalSeconds: (intervalSeconds) =>
    set((state) => {
      state.settings.broll.intervalSeconds = intervalSeconds;
    }),

  setBRollClipDuration: (clipDuration) =>
    set((state) => {
      state.settings.broll.clipDuration = clipDuration;
    }),

  setBRollDisplayMode: (displayMode) =>
    set((state) => {
      state.settings.broll.displayMode = displayMode;
    }),

  setBRollTransition: (transition) =>
    set((state) => {
      state.settings.broll.transition = transition;
    }),

  setBRollPipSize: (pipSize) =>
    set((state) => {
      state.settings.broll.pipSize = pipSize;
    }),

  setBRollPipPosition: (pipPosition) =>
    set((state) => {
      state.settings.broll.pipPosition = pipPosition;
    }),

  // --- Promo Mode ---

  setPromoEnabled: (enabled) =>
    set((state) => {
      state.settings.promo.enabled = enabled;
      state.processingConfig.promoMode = enabled;
      if (enabled) state.settings.broll.enabled = false;
      state.settings.creatorPreset = 'custom';
    }),

  setPromoForceCta: (forceCta) =>
    set((state) => {
      state.settings.promo.forceCta = forceCta;
    }),

  setPromoAccentColor: (accentColor) =>
    set((state) => {
      state.settings.promo.accentColor = accentColor;
    }),

  // --- Filler Removal ---
  //
  // `enabled` is the master kill-switch; it does NOT switch the preset to
  // custom (toggling on/off should be cheap and reversible).
  //
  // Every other granular setter marks the preset as 'custom' so the UI can
  // surface that the user has hand-tuned values that no longer match a named
  // preset. Switching back to a preset via `setFillerRemovalPreset` clobbers
  // the granular values with that preset's canonical settings.

  setFillerRemovalEnabled: (enabled) =>
    set((state) => {
      state.settings.fillerRemoval.enabled = enabled;
    }),

  setFillerRemovalPreset: (preset) =>
    set((state) => {
      const base = preset === 'tight' ? FILLER_PRESET_TIGHT : FILLER_PRESET_LET_IT_RIDE;
      // Preserve the user's enabled toggle across preset switches; replace
      // every other field with the canonical preset values.
      const wasEnabled = state.settings.fillerRemoval.enabled;
      state.settings.fillerRemoval = { ...base, preset, enabled: wasEnabled };
    }),

  setFillerRemovalFillerWords: (removeFillerWords) =>
    set((state) => {
      state.settings.fillerRemoval.removeFillerWords = removeFillerWords;
      state.settings.fillerRemoval.preset = 'custom';
    }),

  setFillerRemovalSilences: (trimSilences) =>
    set((state) => {
      state.settings.fillerRemoval.trimSilences = trimSilences;
      state.settings.fillerRemoval.preset = 'custom';
    }),

  setFillerRemovalRepeats: (removeRepeats) =>
    set((state) => {
      state.settings.fillerRemoval.removeRepeats = removeRepeats;
      state.settings.fillerRemoval.preset = 'custom';
    }),

  setFillerRemovalSilenceThreshold: (silenceThreshold) =>
    set((state) => {
      state.settings.fillerRemoval.silenceThreshold = silenceThreshold;
      state.settings.fillerRemoval.preset = 'custom';
    }),

  setFillerRemovalSilenceTargetGap: (silenceTargetGap) =>
    set((state) => {
      state.settings.fillerRemoval.silenceTargetGap = silenceTargetGap;
      state.settings.fillerRemoval.preset = 'custom';
    }),

  setFillerRemovalWordList: (fillerWords) =>
    set((state) => {
      state.settings.fillerRemoval.fillerWords = fillerWords;
      state.settings.fillerRemoval.preset = 'custom';
    }),

  // --- Notifications ---

  setEnableNotifications: (enabled) =>
    set((state) => {
      state.settings.enableNotifications = enabled;
    }),

  // --- Developer Mode ---

  setDeveloperMode: (enabled) =>
    set((state) => {
      state.settings.developerMode = enabled;
    }),

  // --- Render Quality ---

  setRenderQuality: (quality) =>
    set((state) => {
      Object.assign(state.settings.renderQuality, quality);
    }),

  setOutputAspectRatio: (ratio) =>
    set((state) => {
      state.settings.outputAspectRatio = ratio;
    }),

  setFilenameTemplate: (template) =>
    set((state) => {
      state.settings.filenameTemplate = template;
    }),

  setRenderConcurrency: (concurrency) =>
    set((state) => {
      state.settings.renderConcurrency = Math.max(1, Math.min(4, concurrency));
    }),

  setOutputMode: (mode) =>
    set((state) => {
      state.settings.outputMode = mode;
    }),

  setLongformSkin: (skin) =>
    set((state) => {
      state.settings.longformSkin = skin;
    }),

  setLongformStoryboardStyle: (style) =>
    set((state) => {
      state.settings.longformStoryboardStyle = normalizeStoryboardStyle(style);
    }),

  // --- Long-form color palette ---

  setLongformPaletteId: (id) =>
    set((state) => {
      state.settings.longformPaletteId = id;
    }),

  addCustomPalette: (palette) =>
    set((state) => {
      // Normalise: custom palettes are never built-in, and always carry a
      // stable id (generate one when the caller didn't supply it).
      const normalized = {
        ...palette,
        id: palette.id || crypto.randomUUID(),
        builtin: false,
      };
      const idx = state.settings.customPalettes.findIndex((p) => p.id === normalized.id);
      if (idx >= 0) state.settings.customPalettes[idx] = normalized;
      else state.settings.customPalettes.push(normalized);
    }),

  updateCustomPalette: (id, patch) =>
    set((state) => {
      const target = state.settings.customPalettes.find((p) => p.id === id);
      if (target) Object.assign(target, patch, { id });
    }),

  removeCustomPalette: (id) =>
    set((state) => {
      state.settings.customPalettes = state.settings.customPalettes.filter((p) => p.id !== id);
      // Keep the scoped selection visible as unavailable. A deleted library entry
      // must neither silently recolor a project nor touch any saved plan snapshot.
    }),

  // --- Template Layout (on-screen text positioning) ---

  setTemplateLayout: (layout) =>
    set((state) => {
      state.settings.templateLayout = layout;
    }),

  setTargetPlatform: (platform) =>
    set((state) => {
      state.settings.targetPlatform = platform;
    }),

  resetTemplateLayout: () =>
    set((state) => {
      state.settings.templateLayout = DEFAULT_TEMPLATE_LAYOUT;
      state.settings.targetPlatform = DEFAULT_TARGET_PLATFORM;
    }),

  // --- Reset Settings ---

  resetSettings: () =>
    set((state) => {
      // Preserve app-scoped safeStorage values while resetting creative knobs.
      const apiKey = state.settings.geminiApiKey;
      const falKey = state.settings.falApiKey;
      const pexelsKey = state.settings.pexelsApiKey;
      const outputDir = state.settings.outputDirectory;
      const autosaveIntervalMs = state.settings.autosaveIntervalMs;
      Object.assign(state.settings, DEFAULT_SETTINGS);
      state.settings.geminiApiKey = apiKey;
      state.settings.falApiKey = falKey;
      state.settings.pexelsApiKey = pexelsKey;
      state.settings.outputDirectory = outputDir;
      state.settings.autosaveIntervalMs = autosaveIntervalMs;
    }),

  resetSection: (section) =>
    set((state) => {
      switch (section) {
        case 'aiSettings':
          state.settings.minScore = DEFAULT_SETTINGS.minScore;
          break;
        case 'autoZoom':
          state.settings.autoZoom = DEFAULT_SETTINGS.autoZoom;
          break;
        case 'hookTitle':
          state.settings.hookTitleOverlay = DEFAULT_SETTINGS.hookTitleOverlay;
          break;
        case 'rehook':
          state.settings.rehookOverlay = DEFAULT_SETTINGS.rehookOverlay;
          break;
        case 'fillerRemoval':
          state.settings.fillerRemoval = DEFAULT_SETTINGS.fillerRemoval;
          break;
        case 'broll':
          state.settings.broll = DEFAULT_SETTINGS.broll;
          break;
        case 'promo':
          state.settings.promo = DEFAULT_SETTINGS.promo;
          break;
        case 'renderQuality':
          state.settings.renderQuality = DEFAULT_SETTINGS.renderQuality;
          break;
      }
    }),

  // --- Processing Config ---

  setProcessingConfig: (config) =>
    set((state) => {
      Object.assign(state.processingConfig, config);
      if (config.promoMode !== undefined) {
        state.settings.promo.enabled = config.promoMode;
        if (config.promoMode) state.settings.broll.enabled = false;
      }
    }),

  resetProcessingConfig: () =>
    set((state) => {
      state.processingConfig = { ...DEFAULT_PROCESSING_CONFIG };
      state.settings.promo.enabled = DEFAULT_PROCESSING_CONFIG.promoMode;
    }),
});
