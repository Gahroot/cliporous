import { electronAPI } from '@electron-toolkit/preload';
import type { HistoryMenuState } from '@shared/history';
import { Ch, type IpcSendChannelMap, type SendChannel } from '@shared/ipc-channels';
import { contextBridge, type IpcRendererEvent, ipcRenderer, webFrame, webUtils } from 'electron';

// ---------------------------------------------------------------------------
// Factory helpers — eliminate boilerplate for IPC wrappers
// ---------------------------------------------------------------------------

/** Create an invoke wrapper that forwards all arguments to ipcRenderer.invoke. */
function invoke<T = unknown>(channel: string) {
  return (...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args);
}

/** Create a listener wrapper that subscribes to a send channel and returns an unsubscribe function. */
function listen<C extends SendChannel>(channel: C) {
  return (callback: (data: IpcSendChannelMap[C]) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, data: IpcSendChannelMap[C]) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

// ---------------------------------------------------------------------------
// Shorthand aliases
// ---------------------------------------------------------------------------

const I = Ch.Invoke;
const S = Ch.Send;

// ---------------------------------------------------------------------------
// API object — shape must match the Api interface in index.d.ts
// ---------------------------------------------------------------------------

const api = {
  platform: process.platform,
  setUiZoom: (factor: number): void => webFrame.setZoomFactor(factor),

  // Source — file dialogs + FFmpeg metadata/extraction
  openFiles: invoke(I.DIALOG_OPEN_FILES),
  openDirectory: invoke(I.DIALOG_OPEN_DIRECTORY),
  selectCreatorAsset: invoke<string | null>(I.BRAND_KIT_SELECT_ASSET),
  checkCreatorAssets: invoke<Array<{ path: string; exists: boolean }>>(I.BRAND_KIT_CHECK_ASSETS),
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

  // Python process cancellation (kills in-flight transcribe/download/face-detect)
  cancelPython: invoke(I.PYTHON_CANCEL),

  // AI scoring & generation
  scoreTranscript: invoke(I.AI_SCORE_TRANSCRIPT),
  promoSplit: invoke(I.AI_PROMO_SPLIT),
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

  // Stitched Clips
  generateStitchedClips: invoke(I.AI_STITCH_TRANSCRIPT),
  onStitchProgress: listen(S.AI_STITCH_PROGRESS),

  // Long-form (Hormozi 16:9) edit plan
  generateLongformEditPlan: invoke(I.AI_GENERATE_LONGFORM_EDIT_PLAN),
  cancelLongformEditPlan: invoke(I.AI_CANCEL_LONGFORM_EDIT_PLAN),
  onLongformEditProgress: listen(S.AI_LONGFORM_EDIT_PROGRESS),
  renderLongformScenePreview: invoke(I.RENDER_LONGFORM_SCENE_PREVIEW),
  cancelLongformScenePreview: invoke(I.RENDER_CANCEL_LONGFORM_SCENE_PREVIEW),
  cleanupLongformScenePreview: invoke(I.RENDER_CLEANUP_LONGFORM_SCENE_PREVIEW),

  // Face detection
  detectFaceCrops: invoke(I.FACE_DETECT_CROPS),
  onFaceDetectionProgress: listen(S.FACE_PROGRESS),

  // Captions
  generateCaptions: invoke(I.CAPTIONS_GENERATE),

  // Render pipeline
  startBatchRender: invoke(I.RENDER_START_BATCH),
  cancelRender: invoke(I.RENDER_CANCEL),
  stopRenderAfterCurrent: invoke(I.RENDER_STOP_AFTER_CURRENT),
  cancelQueuedRenderJob: invoke(I.RENDER_CANCEL_JOB),
  onRenderClipStart: listen(S.RENDER_CLIP_START),
  onRenderClipPrepare: listen(S.RENDER_CLIP_PREPARE),
  onRenderClipProgress: listen(S.RENDER_CLIP_PROGRESS),
  onRenderClipDone: listen(S.RENDER_CLIP_DONE),
  onRenderClipError: listen(S.RENDER_CLIP_ERROR),
  onRenderClipCancelled: listen(S.RENDER_CLIP_CANCELLED),
  onRenderBatchDone: listen(S.RENDER_BATCH_DONE),
  onRenderCancelled: listen(S.RENDER_CANCELLED),
  onSegmentFallback: listen(S.SEGMENT_FALLBACK),
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

  // HyperFrames overlays
  renderHyperFramesOverlay: invoke(I.HYPERFRAMES_RENDER_OVERLAY),

  // Project save / load / recent
  saveProject: invoke(I.PROJECT_SAVE),
  loadProject: invoke(I.PROJECT_LOAD),
  loadProjectFromPath: invoke(I.PROJECT_LOAD_FROM_PATH),
  autoSaveProject: invoke(I.PROJECT_AUTO_SAVE),
  loadRecovery: invoke(I.PROJECT_LOAD_RECOVERY),
  clearRecovery: invoke(I.PROJECT_CLEAR_RECOVERY),
  cleanLegacyProject: invoke(I.PROJECT_CLEAN_LEGACY),
  getRecentProjects: invoke(I.PROJECT_GET_RECENT),
  addRecentProject: invoke(I.PROJECT_ADD_RECENT),
  removeRecentProject: invoke(I.PROJECT_REMOVE_RECENT),
  setRecentProjectPinned: invoke(I.PROJECT_SET_RECENT_PINNED),
  renameRecentProject: invoke(I.PROJECT_RENAME_RECENT),
  duplicateRecentProject: invoke(I.PROJECT_DUPLICATE_RECENT),
  deleteRecentProject: invoke(I.PROJECT_DELETE_RECENT),
  consumePendingProjectOpen: invoke(I.PROJECT_CONSUME_PENDING_OPEN),
  clearRecentProjects: invoke(I.PROJECT_CLEAR_RECENT),
  checkMediaPaths: invoke(I.PROJECT_CHECK_MEDIA),
  searchMediaFolder: invoke(I.PROJECT_SEARCH_MEDIA_FOLDER),
  onProjectNewRequest: listen(S.PROJECT_NEW_REQUEST),
  onProjectSaveRequest: listen(S.PROJECT_SAVE_REQUEST),
  onProjectSaveAsRequest: listen(S.PROJECT_SAVE_AS_REQUEST),
  onProjectOpenRequest: listen(S.PROJECT_OPEN_REQUEST),
  onProjectOpenRecentRequest: listen(S.PROJECT_OPEN_RECENT_REQUEST),

  // Native application menu
  onSettingsOpenRequest: listen(S.SETTINGS_OPEN_REQUEST),
  onKeyboardShortcutsRequest: listen(S.KEYBOARD_SHORTCUTS_REQUEST),
  onWhatsNewRequest: listen(S.WHATS_NEW_REQUEST),
  onUpdateCheckRequest: listen(S.UPDATE_CHECK_REQUEST),
  onUiZoomRequest: listen(S.UI_ZOOM_REQUEST),
  setHistoryMenuState: (state: HistoryMenuState): Promise<void> =>
    ipcRenderer.invoke(I.MENU_SET_HISTORY_STATE, state),
  onEditUndoRequest: listen(S.EDIT_UNDO_REQUEST),
  onEditRedoRequest: listen(S.EDIT_REDO_REQUEST),

  // System
  getDiskSpace: invoke(I.SYSTEM_GET_DISK_SPACE),
  getEncoder: invoke(I.SYSTEM_GET_ENCODER),
  getAvailableFonts: invoke(I.SYSTEM_GET_AVAILABLE_FONTS),
  getFontData: invoke(I.SYSTEM_GET_FONT_DATA),
  sendNotification: invoke(I.SYSTEM_NOTIFY),
  setNativeProgress: invoke(I.SYSTEM_SET_PROGRESS),
  setPowerSaveActive: invoke(I.SYSTEM_SET_POWER_SAVE),
  onNotificationClicked: listen(S.SYSTEM_NOTIFICATION_CLICKED),
  getTempSize: invoke(I.SYSTEM_GET_TEMP_SIZE),
  cleanupTemp: invoke(I.SYSTEM_CLEANUP_TEMP),
  getCacheSize: invoke(I.SYSTEM_GET_CACHE_SIZE),
  setAutoCleanup: invoke(I.SYSTEM_SET_AUTO_CLEANUP),
  getLogPath: invoke(I.SYSTEM_GET_LOG_PATH),
  getLogSize: invoke(I.SYSTEM_GET_LOG_SIZE),
  exportLogs: invoke(I.SYSTEM_EXPORT_LOGS),
  openLogFolder: invoke(I.SYSTEM_OPEN_LOG_FOLDER),
  getResourceUsage: invoke(I.SYSTEM_GET_RESOURCE_USAGE),
  /**
   * Forward a renderer-side log entry into the main session log so pipeline
   * failures (which otherwise live only in the in-memory ErrorLog) are visible
   * in the log file. Fire-and-forget; never throws into caller code.
   */
  logToMain: (
    level: 'debug' | 'info' | 'warn' | 'error',
    source: string,
    message: string,
  ): void => {
    void ipcRenderer.invoke(I.SYSTEM_LOG_RENDERER, level, source, message).catch(() => {});
  },

  // Shell
  openPath: invoke(I.SHELL_OPEN_PATH),
  showItemInFolder: invoke(I.SHELL_SHOW_ITEM_IN_FOLDER),
  /**
   * Open the configured output directory in the OS file manager.
   * Reads `settings.outputDirectory` is the renderer's job — this just
   * forwards a path. When `dirPath` is omitted the main process falls
   * back to its default output directory.
   */
  openOutputFolder: (dirPath?: string): Promise<string> =>
    ipcRenderer.invoke(I.SHELL_OPEN_PATH, dirPath ?? ''),
  /**
   * Resolve the app-wide default output directory (`<OS Videos>/BatchClip`).
   * Used to seed `settings.outputDirectory` so rendering works with zero config.
   */
  getDefaultOutputDirectory: invoke<string>(I.SYSTEM_GET_DEFAULT_OUTPUT_DIR),

  // Python setup
  getPythonStatus: invoke(I.PYTHON_GET_STATUS),
  startPythonSetup: invoke(I.PYTHON_START_SETUP),
  cancelPythonSetup: invoke(I.PYTHON_CANCEL_SETUP),
  onPythonSetupProgress: listen(S.PYTHON_SETUP_PROGRESS),
  onPythonSetupDone: listen(S.PYTHON_SETUP_DONE),

  // AI Token Usage
  onAiTokenUsage: listen(S.AI_TOKEN_USAGE),

  // Settings Window
  openSettingsWindow: invoke(I.SETTINGS_WINDOW_OPEN),
  closeSettingsWindow: invoke(I.SETTINGS_WINDOW_CLOSE),
  isSettingsWindowOpen: invoke<boolean>(I.SETTINGS_WINDOW_IS_OPEN),
  onSettingsWindowClosed: listen(S.SETTINGS_WINDOW_CLOSED),

  // Desktop lifecycle safety — main process owns close/quit/restart settlement.
  reportLifecycleState: invoke(I.LIFECYCLE_REPORT_STATE),
  completeLifecyclePreparation: invoke(I.LIFECYCLE_COMPLETE_PREPARATION),
  requestAppRestart: invoke<boolean>(I.LIFECYCLE_REQUEST_RESTART),
  onLifecyclePrepare: listen(S.LIFECYCLE_PREPARE),

  // Signed updates
  getUpdateState: invoke(I.UPDATE_GET_STATE),
  checkForUpdates: invoke(I.UPDATE_CHECK),
  downloadUpdate: invoke(I.UPDATE_DOWNLOAD),
  installUpdate: invoke<boolean>(I.UPDATE_INSTALL),
  onUpdateState: listen(S.UPDATE_STATE),

  // Secrets — encrypted API key storage (safeStorage-backed)
  secrets: {
    get: (name: string): Promise<string | null> => ipcRenderer.invoke(I.SECRETS_GET, name),
    set: (name: string, value: string): Promise<void> =>
      ipcRenderer.invoke(I.SECRETS_SET, name, value),
    has: (name: string): Promise<boolean> => ipcRenderer.invoke(I.SECRETS_HAS, name),
    clear: (name: string): Promise<void> => ipcRenderer.invoke(I.SECRETS_CLEAR, name),
  },
};

// ---------------------------------------------------------------------------
// Expose to renderer
// ---------------------------------------------------------------------------

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  (globalThis as unknown as { electron: typeof electronAPI }).electron = electronAPI;
  (globalThis as unknown as { api: typeof api }).api = api;
}
