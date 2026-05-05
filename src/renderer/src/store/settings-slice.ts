import type { StateCreator } from 'zustand'
import type {
  AppState,
  AppSettings,
  ProcessingConfig,
  RenderQualitySettings,
} from './types'
import type {
  ZoomIntensity,
  ZoomMode,
  HookTitleStyle,
  RehookStyle,
  OutputAspectRatio,
  BRollDisplayMode,
  BRollTransition,
} from './types'
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROCESSING_CONFIG,
  loadPersistedSettings,
  loadPersistedProcessingConfig,
} from './helpers'
import { _pushUndo } from './history-slice'

// ---------------------------------------------------------------------------
// Settings Slice
// ---------------------------------------------------------------------------

export interface SettingsSlice {
  settings: AppSettings
  processingConfig: ProcessingConfig

  /** Hydrate API keys from main-process encrypted store (safeStorage). */
  hydrateSecretsFromMain: () => Promise<void>

  // Settings setters
  setGeminiApiKey: (key: string) => void
  setFalApiKey: (key: string) => void
  setOutputDirectory: (dir: string) => void
  setMinScore: (score: number) => void
  setAutoZoomEnabled: (enabled: boolean) => void
  setAutoZoomMode: (mode: ZoomMode) => void
  setAutoZoomIntensity: (intensity: ZoomIntensity) => void
  setAutoZoomInterval: (seconds: number) => void
  setHookTitleEnabled: (enabled: boolean) => void
  setHookTitleStyle: (style: HookTitleStyle) => void
  setHookTitleDisplayDuration: (seconds: number) => void
  setHookTitleFontSize: (px: number) => void
  setHookTitleTextColor: (color: string) => void
  setHookTitleOutlineColor: (color: string) => void
  setHookTitleOutlineWidth: (px: number) => void
  setHookTitleFadeIn: (seconds: number) => void
  setHookTitleFadeOut: (seconds: number) => void
  setRehookEnabled: (enabled: boolean) => void
  setRehookStyle: (style: RehookStyle) => void
  setRehookDisplayDuration: (seconds: number) => void
  setRehookPositionFraction: (fraction: number) => void
  setBRollEnabled: (enabled: boolean) => void
  setBRollIntervalSeconds: (seconds: number) => void
  setBRollClipDuration: (seconds: number) => void
  setBRollDisplayMode: (mode: BRollDisplayMode) => void
  setBRollTransition: (transition: BRollTransition) => void
  setBRollPipSize: (size: number) => void
  setBRollPipPosition: (position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void
  setFillerRemovalEnabled: (enabled: boolean) => void
  setFillerRemovalFillerWords: (enabled: boolean) => void
  setFillerRemovalSilences: (enabled: boolean) => void
  setFillerRemovalRepeats: (enabled: boolean) => void
  setFillerRemovalSilenceThreshold: (seconds: number) => void
  setFillerRemovalWordList: (words: string[]) => void
  setEnableNotifications: (enabled: boolean) => void
  setDeveloperMode: (enabled: boolean) => void
  setRenderQuality: (quality: Partial<RenderQualitySettings>) => void
  setOutputAspectRatio: (ratio: OutputAspectRatio) => void
  setFilenameTemplate: (template: string) => void
  setRenderConcurrency: (concurrency: number) => void
  resetSettings: () => void
  resetSection: (section: 'autoZoom' | 'hookTitle' | 'rehook' | 'fillerRemoval' | 'broll' | 'aiSettings' | 'renderQuality') => void

  // Processing config
  setProcessingConfig: (config: Partial<ProcessingConfig>) => void
  resetProcessingConfig: () => void
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
    const secrets = window.api?.secrets
    if (!secrets) return

    // One-time migration from legacy plaintext localStorage entries into safeStorage.
    const migrations: Array<[secretName: string, legacyKey: string]> = [
      ['gemini', 'batchclip-gemini-key'],
      ['fal', 'batchclip-fal-key'],
    ]
    await Promise.all(
      migrations.map(async ([name, legacyKey]) => {
        const legacy = localStorage.getItem(legacyKey)
        if (!legacy) return
        try {
          await secrets.set(name, legacy)
          localStorage.removeItem(legacyKey)
        } catch (err) {
          console.warn(`[secrets] Failed to migrate legacy ${name} key:`, err)
        }
      })
    )

    try {
      const [gemini, fal] = await Promise.all([
        secrets.get('gemini'),
        secrets.get('fal'),
      ])
      set((state) => {
        if (gemini) state.settings.geminiApiKey = gemini
        if (fal) state.settings.falApiKey = fal
      })
    } catch (err) {
      console.warn('[secrets] Failed to hydrate secrets from main:', err)
    }
  },

  // --- Settings ---

  setGeminiApiKey: (key) => {
    void window.api?.secrets?.set('gemini', key)
    set((state) => { state.settings.geminiApiKey = key })
  },

  setFalApiKey: (key) => {
    void window.api?.secrets?.set('fal', key)
    set((state) => { state.settings.falApiKey = key })
  },

  setOutputDirectory: (dir) =>
    set((state) => { state.settings.outputDirectory = dir }),

  setMinScore: (score) => {
    _pushUndo(get(), set)
    set((state) => { state.settings.minScore = score })
  },

  setAutoZoomEnabled: (enabled) =>
    set((state) => { state.settings.autoZoom.enabled = enabled }),

  setAutoZoomMode: (mode) =>
    set((state) => { state.settings.autoZoom.mode = mode }),

  setAutoZoomIntensity: (intensity) =>
    set((state) => { state.settings.autoZoom.intensity = intensity }),

  setAutoZoomInterval: (intervalSeconds) =>
    set((state) => { state.settings.autoZoom.intervalSeconds = intervalSeconds }),

  // --- Hook Title Overlay ---

  setHookTitleEnabled: (enabled) =>
    set((state) => { state.settings.hookTitleOverlay.enabled = enabled }),

  setHookTitleStyle: (style) =>
    set((state) => { state.settings.hookTitleOverlay.style = style }),

  setHookTitleDisplayDuration: (displayDuration) =>
    set((state) => { state.settings.hookTitleOverlay.displayDuration = displayDuration }),

  setHookTitleFontSize: (fontSize) =>
    set((state) => { state.settings.hookTitleOverlay.fontSize = fontSize }),

  setHookTitleTextColor: (textColor) =>
    set((state) => { state.settings.hookTitleOverlay.textColor = textColor }),

  setHookTitleOutlineColor: (outlineColor) =>
    set((state) => { state.settings.hookTitleOverlay.outlineColor = outlineColor }),

  setHookTitleOutlineWidth: (outlineWidth) =>
    set((state) => { state.settings.hookTitleOverlay.outlineWidth = outlineWidth }),

  setHookTitleFadeIn: (fadeIn) =>
    set((state) => { state.settings.hookTitleOverlay.fadeIn = fadeIn }),

  setHookTitleFadeOut: (fadeOut) =>
    set((state) => { state.settings.hookTitleOverlay.fadeOut = fadeOut }),

  // --- Re-hook Overlay ---

  setRehookEnabled: (enabled) =>
    set((state) => { state.settings.rehookOverlay.enabled = enabled }),

  setRehookStyle: (style) =>
    set((state) => { state.settings.rehookOverlay.style = style }),

  setRehookDisplayDuration: (displayDuration) =>
    set((state) => { state.settings.rehookOverlay.displayDuration = displayDuration }),

  setRehookPositionFraction: (positionFraction) =>
    set((state) => { state.settings.rehookOverlay.positionFraction = positionFraction }),

  // --- B-Roll ---

  setBRollEnabled: (enabled) =>
    set((state) => { state.settings.broll.enabled = enabled }),

  setBRollIntervalSeconds: (intervalSeconds) =>
    set((state) => { state.settings.broll.intervalSeconds = intervalSeconds }),

  setBRollClipDuration: (clipDuration) =>
    set((state) => { state.settings.broll.clipDuration = clipDuration }),

  setBRollDisplayMode: (displayMode) =>
    set((state) => { state.settings.broll.displayMode = displayMode }),

  setBRollTransition: (transition) =>
    set((state) => { state.settings.broll.transition = transition }),

  setBRollPipSize: (pipSize) =>
    set((state) => { state.settings.broll.pipSize = pipSize }),

  setBRollPipPosition: (pipPosition) =>
    set((state) => { state.settings.broll.pipPosition = pipPosition }),

  // --- Filler Removal ---

  setFillerRemovalEnabled: (enabled) =>
    set((state) => { state.settings.fillerRemoval.enabled = enabled }),

  setFillerRemovalFillerWords: (removeFillerWords) =>
    set((state) => { state.settings.fillerRemoval.removeFillerWords = removeFillerWords }),

  setFillerRemovalSilences: (trimSilences) =>
    set((state) => { state.settings.fillerRemoval.trimSilences = trimSilences }),

  setFillerRemovalRepeats: (removeRepeats) =>
    set((state) => { state.settings.fillerRemoval.removeRepeats = removeRepeats }),

  setFillerRemovalSilenceThreshold: (silenceThreshold) =>
    set((state) => { state.settings.fillerRemoval.silenceThreshold = silenceThreshold }),

  setFillerRemovalWordList: (fillerWords) =>
    set((state) => { state.settings.fillerRemoval.fillerWords = fillerWords }),

  // --- Notifications ---

  setEnableNotifications: (enabled) =>
    set((state) => { state.settings.enableNotifications = enabled }),

  // --- Developer Mode ---

  setDeveloperMode: (enabled) =>
    set((state) => { state.settings.developerMode = enabled }),

  // --- Render Quality ---

  setRenderQuality: (quality) =>
    set((state) => { Object.assign(state.settings.renderQuality, quality) }),

  setOutputAspectRatio: (ratio) =>
    set((state) => { state.settings.outputAspectRatio = ratio }),

  setFilenameTemplate: (template) =>
    set((state) => { state.settings.filenameTemplate = template }),

  setRenderConcurrency: (concurrency) =>
    set((state) => { state.settings.renderConcurrency = Math.max(1, Math.min(4, concurrency)) }),

  // --- Reset Settings ---

  resetSettings: () =>
    set((state) => {
      const apiKey = state.settings.geminiApiKey
      const falKey = state.settings.falApiKey
      const outputDir = state.settings.outputDirectory
      Object.assign(state.settings, DEFAULT_SETTINGS)
      state.settings.geminiApiKey = apiKey
      state.settings.falApiKey = falKey
      state.settings.outputDirectory = outputDir
    }),

  resetSection: (section) =>
    set((state) => {
      switch (section) {
        case 'aiSettings':
          state.settings.minScore = DEFAULT_SETTINGS.minScore
          break
        case 'autoZoom':
          state.settings.autoZoom = DEFAULT_SETTINGS.autoZoom
          break
        case 'hookTitle':
          state.settings.hookTitleOverlay = DEFAULT_SETTINGS.hookTitleOverlay
          break
        case 'rehook':
          state.settings.rehookOverlay = DEFAULT_SETTINGS.rehookOverlay
          break
        case 'fillerRemoval':
          state.settings.fillerRemoval = DEFAULT_SETTINGS.fillerRemoval
          break
        case 'broll':
          state.settings.broll = DEFAULT_SETTINGS.broll
          break
        case 'renderQuality':
          state.settings.renderQuality = DEFAULT_SETTINGS.renderQuality
          break
      }
    }),

  // --- Processing Config ---

  setProcessingConfig: (config) =>
    set((state) => { Object.assign(state.processingConfig, config) }),

  resetProcessingConfig: () => set({ processingConfig: DEFAULT_PROCESSING_CONFIG }),
})
