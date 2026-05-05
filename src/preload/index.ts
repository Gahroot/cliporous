import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Ch, IpcSendChannelMap, SendChannel } from '@shared/ipc-channels'

// ---------------------------------------------------------------------------
// Factory helpers — eliminate boilerplate for IPC wrappers
// ---------------------------------------------------------------------------

/** Create an invoke wrapper that forwards all arguments to ipcRenderer.invoke. */
function invoke<T = unknown>(channel: string) {
  return (...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args)
}

/** Create a listener wrapper that subscribes to a send channel and returns an unsubscribe function. */
function listen<C extends SendChannel>(channel: C) {
  return (callback: (data: IpcSendChannelMap[C]) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, data: IpcSendChannelMap[C]) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

// ---------------------------------------------------------------------------
// Shorthand aliases
// ---------------------------------------------------------------------------

const I = Ch.Invoke
const S = Ch.Send

// ---------------------------------------------------------------------------
// API object — shape must match the Api interface in index.d.ts
// ---------------------------------------------------------------------------

const api = {
  // Source — file dialogs + FFmpeg metadata/extraction
  openFiles: invoke(I.DIALOG_OPEN_FILES),
  openDirectory: invoke(I.DIALOG_OPEN_DIRECTORY),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getMetadata: invoke(I.FFMPEG_GET_METADATA),
  extractAudio: invoke(I.FFMPEG_EXTRACT_AUDIO),
  getThumbnail: invoke(I.FFMPEG_THUMBNAIL),
  getWaveform: invoke(I.FFMPEG_GET_WAVEFORM),

  // YouTube
  downloadYouTube: invoke(I.YOUTUBE_DOWNLOAD),
  onYouTubeProgress: listen(S.YOUTUBE_PROGRESS),

  // Transcription
  transcribeVideo: invoke(I.TRANSCRIBE_VIDEO),
  formatTranscriptForAI: invoke(I.TRANSCRIBE_FORMAT_FOR_AI),
  onTranscribeProgress: listen(S.TRANSCRIBE_PROGRESS),

  // AI scoring & generation
  scoreTranscript: invoke(I.AI_SCORE_TRANSCRIPT),
  onScoringProgress: listen(S.AI_SCORING_PROGRESS),
  generateHookText: invoke(I.AI_GENERATE_HOOK_TEXT),
  rescoreSingleClip: invoke(I.AI_RESCORE_SINGLE_CLIP),
  generateRehookText: invoke(I.AI_GENERATE_REHOOK_TEXT),
  validateGeminiKey: invoke(I.AI_VALIDATE_GEMINI_KEY),
  validatePexelsKey: invoke(I.AI_VALIDATE_PEXELS_KEY),

  // Curiosity Gap Detector
  detectCuriosityGaps: invoke(I.AI_DETECT_CURIOSITY_GAPS),
  optimizeClipBoundaries: invoke(I.AI_OPTIMIZE_CLIP_BOUNDARIES),
  optimizeClipEndpoints: invoke(I.AI_OPTIMIZE_CLIP_ENDPOINTS),
  rankClipsByCuriosity: invoke(I.AI_RANK_CLIPS_BY_CURIOSITY),

  // Description Generator
  generateClipDescription: invoke(I.AI_GENERATE_CLIP_DESCRIPTION),
  generateBatchDescriptions: invoke(I.AI_GENERATE_BATCH_DESCRIPTIONS),

  // Word Emphasis
  analyzeWordEmphasis: invoke(I.AI_ANALYZE_WORD_EMPHASIS),

  // Face detection
  detectFaceCrops: invoke(I.FACE_DETECT_CROPS),
  onFaceDetectionProgress: listen(S.FACE_PROGRESS),

  // Captions
  generateCaptions: invoke(I.CAPTIONS_GENERATE),

  // Render pipeline
  startBatchRender: invoke(I.RENDER_START_BATCH),
  cancelRender: invoke(I.RENDER_CANCEL),
  onRenderClipStart: listen(S.RENDER_CLIP_START),
  onRenderClipPrepare: listen(S.RENDER_CLIP_PREPARE),
  onRenderClipProgress: listen(S.RENDER_CLIP_PROGRESS),
  onRenderClipDone: listen(S.RENDER_CLIP_DONE),
  onRenderClipError: listen(S.RENDER_CLIP_ERROR),
  onRenderBatchDone: listen(S.RENDER_BATCH_DONE),
  onRenderCancelled: listen(S.RENDER_CANCELLED),
  renderPreview: invoke(I.RENDER_PREVIEW),
  cleanupPreview: invoke(I.RENDER_CLEANUP_PREVIEW),

  // B-Roll
  generateBRollPlacements: invoke(I.BROLL_GENERATE_PLACEMENTS),
  generateBRollImage: invoke(I.BROLL_GENERATE_IMAGE),
  regenerateBRollImage: invoke(I.BROLL_REGENERATE_IMAGE),

  // fal.ai Image Generation
  generateFalImage: invoke(I.FAL_GENERATE_IMAGE),

  // Export
  exportDescriptions: invoke(I.EXPORT_DESCRIPTIONS),

  // Project save / load / recent
  saveProject: invoke(I.PROJECT_SAVE),
  loadProject: invoke(I.PROJECT_LOAD),
  loadProjectFromPath: invoke(I.PROJECT_LOAD_FROM_PATH),
  autoSaveProject: invoke(I.PROJECT_AUTO_SAVE),
  loadRecovery: invoke(I.PROJECT_LOAD_RECOVERY),
  clearRecovery: invoke(I.PROJECT_CLEAR_RECOVERY),
  getRecentProjects: invoke(I.PROJECT_GET_RECENT),
  addRecentProject: invoke(I.PROJECT_ADD_RECENT),
  removeRecentProject: invoke(I.PROJECT_REMOVE_RECENT),
  clearRecentProjects: invoke(I.PROJECT_CLEAR_RECENT),

  // System
  getDiskSpace: invoke(I.SYSTEM_GET_DISK_SPACE),
  getEncoder: invoke(I.SYSTEM_GET_ENCODER),
  getAvailableFonts: invoke(I.SYSTEM_GET_AVAILABLE_FONTS),
  getFontData: invoke(I.SYSTEM_GET_FONT_DATA),
  sendNotification: invoke(I.SYSTEM_NOTIFY),
  getTempSize: invoke(I.SYSTEM_GET_TEMP_SIZE),
  cleanupTemp: invoke(I.SYSTEM_CLEANUP_TEMP),
  getCacheSize: invoke(I.SYSTEM_GET_CACHE_SIZE),
  setAutoCleanup: invoke(I.SYSTEM_SET_AUTO_CLEANUP),
  getLogPath: invoke(I.SYSTEM_GET_LOG_PATH),
  getLogSize: invoke(I.SYSTEM_GET_LOG_SIZE),
  exportLogs: invoke(I.SYSTEM_EXPORT_LOGS),
  openLogFolder: invoke(I.SYSTEM_OPEN_LOG_FOLDER),
  getResourceUsage: invoke(I.SYSTEM_GET_RESOURCE_USAGE),

  // Shell
  openPath: invoke(I.SHELL_OPEN_PATH),
  showItemInFolder: invoke(I.SHELL_SHOW_ITEM_IN_FOLDER),

  // Python setup
  getPythonStatus: invoke(I.PYTHON_GET_STATUS),
  startPythonSetup: invoke(I.PYTHON_START_SETUP),
  onPythonSetupProgress: listen(S.PYTHON_SETUP_PROGRESS),
  onPythonSetupDone: listen(S.PYTHON_SETUP_DONE),

  // AI Token Usage
  onAiTokenUsage: listen(S.AI_TOKEN_USAGE),

  // Image Cache
  clearImageCache: invoke(I.IMAGE_CACHE_CLEAR),
  getImageCacheStats: invoke(I.IMAGE_CACHE_STATS),

  // Settings Window
  openSettingsWindow: invoke(I.SETTINGS_WINDOW_OPEN),
  closeSettingsWindow: invoke(I.SETTINGS_WINDOW_CLOSE),
  isSettingsWindowOpen: invoke<boolean>(I.SETTINGS_WINDOW_IS_OPEN),
  onSettingsWindowClosed: listen(S.SETTINGS_WINDOW_CLOSED),

  // Secrets — encrypted API key storage (safeStorage-backed)
  secrets: {
    get: (name: string): Promise<string | null> => ipcRenderer.invoke(I.SECRETS_GET, name),
    set: (name: string, value: string): Promise<void> => ipcRenderer.invoke(I.SECRETS_SET, name, value),
    has: (name: string): Promise<boolean> => ipcRenderer.invoke(I.SECRETS_HAS, name),
    clear: (name: string): Promise<void> => ipcRenderer.invoke(I.SECRETS_CLEAR, name),
  },
}

// ---------------------------------------------------------------------------
// Expose to renderer
// ---------------------------------------------------------------------------

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
