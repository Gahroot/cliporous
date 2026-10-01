// ---------------------------------------------------------------------------
// IPC Channel Registry
//
// Single source of truth for every IPC channel name used across the Electron
// main process, preload bridge, and renderer.  Import `Ch` (or individual
// sub-objects) instead of writing string literals.
//
// The companion type map (`IpcSendChannelMap`) lets you derive the payload
// type for a main→renderer send channel at compile time via the
// `IpcSendData` helper.  Invoke channels are typed via the preload `Api`
// interface, so we don't duplicate their signatures here.
// ---------------------------------------------------------------------------

// ---- Invoke channels (renderer → main, request/response) -----------------

export const InvokeChannels = {
  // Dialog
  DIALOG_OPEN_FILES: 'dialog:openFiles',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  // Creator Profile / Brand Kit assets
  BRAND_KIT_SELECT_ASSET: 'brand-kit:selectAsset',
  BRAND_KIT_CHECK_ASSETS: 'brand-kit:checkAssets',

  // FFmpeg
  FFMPEG_GET_METADATA: 'ffmpeg:getMetadata',
  FFMPEG_EXTRACT_AUDIO: 'ffmpeg:extractAudio',
  FFMPEG_THUMBNAIL: 'ffmpeg:thumbnail',
  FFMPEG_GET_WAVEFORM: 'ffmpeg:getWaveform',

  // YouTube
  YOUTUBE_DOWNLOAD: 'youtube:download',

  // Transcription
  TRANSCRIBE_VIDEO: 'transcribe:video',
  TRANSCRIBE_FORMAT_FOR_AI: 'transcribe:formatForAI',

  // AI scoring & generation
  AI_SCORE_TRANSCRIPT: 'ai:scoreTranscript',
  AI_GENERATE_HOOK_TEXT: 'ai:generateHookText',
  AI_GENERATE_REHOOK_TEXT: 'ai:generateRehookText',
  AI_RESCORE_SINGLE_CLIP: 'ai:rescoreSingleClip',
  AI_VALIDATE_GEMINI_KEY: 'ai:validateGeminiKey',
  AI_VALIDATE_PEXELS_KEY: 'ai:validatePexelsKey',
  AI_DETECT_CURIOSITY_GAPS: 'ai:detectCuriosityGaps',
  AI_OPTIMIZE_CLIP_BOUNDARIES: 'ai:optimizeClipBoundaries',
  AI_OPTIMIZE_CLIP_ENDPOINTS: 'ai:optimizeClipEndpoints',
  AI_RANK_CLIPS_BY_CURIOSITY: 'ai:rankClipsByCuriosity',
  AI_GENERATE_CLIP_DESCRIPTION: 'ai:generateClipDescription',
  AI_GENERATE_BATCH_DESCRIPTIONS: 'ai:generateBatchDescriptions',
  AI_ANALYZE_WORD_EMPHASIS: 'ai:analyzeWordEmphasis',
  AI_STITCH_TRANSCRIPT: 'ai:stitchTranscript',
  AI_GENERATE_LONGFORM_EDIT_PLAN: 'ai:generateLongformEditPlan',
  AI_CANCEL_LONGFORM_EDIT_PLAN: 'ai:cancelLongformEditPlan',
  RENDER_LONGFORM_SCENE_PREVIEW: 'render:longformScenePreview',
  RENDER_CANCEL_LONGFORM_SCENE_PREVIEW: 'render:cancelLongformScenePreview',
  RENDER_CLEANUP_LONGFORM_SCENE_PREVIEW: 'render:cleanupLongformScenePreview',
  AI_PROMO_SPLIT: 'ai:promoSplit',

  // Face detection
  FACE_DETECT_CROPS: 'face:detectCrops',

  // Render pipeline
  RENDER_START_BATCH: 'render:startBatch',
  RENDER_CANCEL: 'render:cancel',
  RENDER_STOP_AFTER_CURRENT: 'render:stopAfterCurrent',
  RENDER_CANCEL_JOB: 'render:cancelJob',
  RENDER_PREVIEW: 'render:preview',
  RENDER_CLEANUP_PREVIEW: 'render:cleanupPreview',

  // Captions
  CAPTIONS_GENERATE: 'captions:generate',

  // fal.ai Image Generation
  FAL_GENERATE_IMAGE: 'fal:generateImage',

  // B-Roll (Pexels + fal.ai)
  BROLL_GENERATE_PLACEMENTS: 'broll:generatePlacements',
  BROLL_GENERATE_IMAGE: 'broll:generateImage',
  BROLL_REGENERATE_IMAGE: 'broll:regenerateImage',

  // Project save / load / recovery
  PROJECT_SAVE: 'project:save',
  PROJECT_LOAD: 'project:load',
  PROJECT_LOAD_FROM_PATH: 'project:loadFromPath',
  PROJECT_AUTO_SAVE: 'project:autoSave',
  PROJECT_LOAD_RECOVERY: 'project:loadRecovery',
  PROJECT_CLEAR_RECOVERY: 'project:clearRecovery',
  PROJECT_CLEAN_LEGACY: 'project:cleanLegacy',
  PROJECT_GET_RECENT: 'project:getRecent',
  PROJECT_ADD_RECENT: 'project:addRecent',
  PROJECT_REMOVE_RECENT: 'project:removeRecent',
  PROJECT_SET_RECENT_PINNED: 'project:setRecentPinned',
  PROJECT_RENAME_RECENT: 'project:renameRecent',
  PROJECT_DUPLICATE_RECENT: 'project:duplicateRecent',
  PROJECT_DELETE_RECENT: 'project:deleteRecent',
  PROJECT_CONSUME_PENDING_OPEN: 'project:consumePendingOpen',
  PROJECT_CLEAR_RECENT: 'project:clearRecent',
  PROJECT_CHECK_MEDIA: 'project:checkMedia',
  PROJECT_SEARCH_MEDIA_FOLDER: 'project:searchMediaFolder',

  // Python setup (required for transcribe + face-detect)
  PYTHON_GET_STATUS: 'python:getStatus',
  PYTHON_START_SETUP: 'python:startSetup',
  PYTHON_CANCEL_SETUP: 'python:cancelSetup',
  PYTHON_CANCEL: 'python:cancel',

  // System
  SYSTEM_GET_DISK_SPACE: 'system:getDiskSpace',
  SYSTEM_NOTIFY: 'system:notify',
  SYSTEM_SET_PROGRESS: 'system:setProgress',
  SYSTEM_SET_POWER_SAVE: 'system:setPowerSave',
  SYSTEM_GET_ENCODER: 'system:getEncoder',
  SYSTEM_GET_AVAILABLE_FONTS: 'system:getAvailableFonts',
  SYSTEM_GET_FONT_DATA: 'system:getFontData',
  SYSTEM_GET_TEMP_SIZE: 'system:getTempSize',
  SYSTEM_CLEANUP_TEMP: 'system:cleanupTemp',
  SYSTEM_GET_CACHE_SIZE: 'system:getCacheSize',
  SYSTEM_SET_AUTO_CLEANUP: 'system:setAutoCleanup',
  SYSTEM_GET_LOG_PATH: 'system:getLogPath',
  SYSTEM_GET_LOG_SIZE: 'system:getLogSize',
  SYSTEM_EXPORT_LOGS: 'system:exportLogs',
  SYSTEM_OPEN_LOG_FOLDER: 'system:openLogFolder',
  SYSTEM_GET_RESOURCE_USAGE: 'system:getResourceUsage',
  SYSTEM_LOG_RENDERER: 'system:logRenderer',
  SYSTEM_GET_DEFAULT_OUTPUT_DIR: 'system:getDefaultOutputDir',

  // Shell
  SHELL_OPEN_PATH: 'shell:openPath',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder',

  // Settings Window
  SETTINGS_WINDOW_OPEN: 'settings-window:open',
  SETTINGS_WINDOW_CLOSE: 'settings-window:close',
  SETTINGS_WINDOW_IS_OPEN: 'settings-window:is-open',

  // Desktop lifecycle safety
  LIFECYCLE_REPORT_STATE: 'lifecycle:reportState',
  LIFECYCLE_COMPLETE_PREPARATION: 'lifecycle:completePreparation',
  LIFECYCLE_REQUEST_RESTART: 'lifecycle:requestRestart',

  // Native application menu
  MENU_SET_HISTORY_STATE: 'menu:setHistoryState',

  // Signed application updates
  UPDATE_GET_STATE: 'update:getState',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',

  // Secrets (encrypted API key storage via Electron safeStorage)
  SECRETS_GET: 'secrets:get',
  SECRETS_SET: 'secrets:set',
  SECRETS_HAS: 'secrets:has',
  SECRETS_CLEAR: 'secrets:clear',

  // Export — social-media descriptions (csv/json/txt)
  EXPORT_DESCRIPTIONS: 'export:descriptions',

  // HyperFrames overlays
  HYPERFRAMES_RENDER_OVERLAY: 'hyperframes:renderOverlay',
} as const;

// ---- Send channels (main → renderer, fire-and-forget) ---------------------

export const SendChannels = {
  YOUTUBE_PROGRESS: 'youtube:progress',
  TRANSCRIBE_PROGRESS: 'transcribe:progress',
  AI_SCORING_PROGRESS: 'ai:scoringProgress',
  FACE_PROGRESS: 'face:progress',
  RENDER_CLIP_START: 'render:clipStart',
  RENDER_CLIP_PROGRESS: 'render:clipProgress',
  RENDER_CLIP_DONE: 'render:clipDone',
  RENDER_CLIP_ERROR: 'render:clipError',
  RENDER_CLIP_CANCELLED: 'render:clipCancelled',
  RENDER_BATCH_DONE: 'render:batchDone',
  RENDER_CANCELLED: 'render:cancelled',
  RENDER_CLIP_PREPARE: 'render:clipPrepare',
  PYTHON_SETUP_PROGRESS: 'python:setupProgress',
  PYTHON_SETUP_DONE: 'python:setupDone',
  AI_TOKEN_USAGE: 'ai:tokenUsage',
  SETTINGS_WINDOW_CLOSED: 'settings-window:closed',
  SEGMENT_FALLBACK: 'render:segmentFallback',
  AI_STITCH_PROGRESS: 'ai:stitchProgress',
  AI_LONGFORM_EDIT_PROGRESS: 'ai:longformEditProgress',
  PROJECT_NEW_REQUEST: 'project:newRequest',
  PROJECT_SAVE_REQUEST: 'project:saveRequest',
  PROJECT_SAVE_AS_REQUEST: 'project:saveAsRequest',
  PROJECT_OPEN_REQUEST: 'project:openRequest',
  PROJECT_OPEN_RECENT_REQUEST: 'project:openRecentRequest',
  SETTINGS_OPEN_REQUEST: 'settings:openRequest',
  KEYBOARD_SHORTCUTS_REQUEST: 'keyboard:shortcutsRequest',
  WHATS_NEW_REQUEST: 'release:whatsNewRequest',
  UPDATE_CHECK_REQUEST: 'update:checkRequest',
  UI_ZOOM_REQUEST: 'ui:zoomRequest',
  EDIT_UNDO_REQUEST: 'edit:undoRequest',
  EDIT_REDO_REQUEST: 'edit:redoRequest',
  LIFECYCLE_PREPARE: 'lifecycle:prepare',
  SYSTEM_NOTIFICATION_CLICKED: 'system:notificationClicked',
  UPDATE_STATE: 'update:state',
} as const;

// ---- Combined shorthand -------------------------------------------------

/** All channel name constants. Use `Ch.Invoke.FOO` or `Ch.Send.BAR`. */
export const Ch = {
  Invoke: InvokeChannels,
  Send: SendChannels,
} as const;

// ---- Derived literal-union types -----------------------------------------

/** Union of all invoke channel name strings. */
export type InvokeChannel = (typeof InvokeChannels)[keyof typeof InvokeChannels];

/** Union of all send channel name strings. */
export type SendChannel = (typeof SendChannels)[keyof typeof SendChannels];

/** Union of every IPC channel name. */
export type AnyChannel = InvokeChannel | SendChannel;

// ---- Send-channel payload map -------------------------------------------
//
// We type the send channels here (smaller set, high-value for safety).
// Invoke channels are fully typed via the preload `Api` interface, so we
// don't duplicate their signatures.
//
// Payload shapes are inlined to keep this module self-contained — it has
// no dependency on `@shared/types`, which means the channel registry can
// be imported from anywhere (main, preload, renderer) without dragging in
// domain modules.
// ---------------------------------------------------------------------------

export interface IpcSendChannelMap {
  [SendChannels.YOUTUBE_PROGRESS]: { percent: number };
  [SendChannels.TRANSCRIBE_PROGRESS]: { stage: string; message: string };
  [SendChannels.AI_SCORING_PROGRESS]: {
    stage: string;
    message: string;
    percent?: number;
  };
  [SendChannels.FACE_PROGRESS]: {
    stage: string;
    message: string;
    percent?: number;
  };
  [SendChannels.RENDER_CLIP_START]: {
    clipId: string;
    index: number;
    total: number;
    encoder: string;
    encoderIsHardware: boolean;
  };
  [SendChannels.RENDER_CLIP_PROGRESS]: { clipId: string; percent: number };
  [SendChannels.RENDER_CLIP_DONE]: {
    clipId: string;
    outputPath: string;
    /** One-line "what rendered vs. unavailable" note shown on the done row (RF-008). */
    summary?: string;
  };
  [SendChannels.RENDER_CLIP_ERROR]: {
    clipId: string;
    /** Short, human-readable summary of what went wrong (RF-022). */
    error: string;
    /** Suggested action the user can take, when the cause is recognised. */
    suggestion?: string;
    /** Raw engine output (stderr tail), shown behind a "details" expander. */
    details?: string;
    ffmpegCommand?: string;
  };
  [SendChannels.RENDER_CLIP_CANCELLED]: { clipId: string };
  [SendChannels.RENDER_BATCH_DONE]: {
    completed: number;
    failed: number;
    cancelled?: number;
    total: number;
    /** Absolute path to the exported manifest.csv, when one was written. */
    manifestCsvPath?: string;
    /** Absolute path to the exported manifest.json, when one was written. */
    manifestJsonPath?: string;
  };
  [SendChannels.RENDER_CANCELLED]: {
    completed: number;
    failed: number;
    cancelled?: number;
    total: number;
  };
  [SendChannels.RENDER_CLIP_PREPARE]: {
    clipId: string;
    message: string;
    percent: number;
  };
  [SendChannels.PYTHON_SETUP_PROGRESS]: import('./python-setup').PythonSetupProgress;
  [SendChannels.PYTHON_SETUP_DONE]: import('./python-setup').PythonSetupDone;
  [SendChannels.AI_TOKEN_USAGE]: {
    source: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    timestamp: number;
  };
  [SendChannels.SETTINGS_WINDOW_CLOSED]: Record<string, never>;
  [SendChannels.PROJECT_NEW_REQUEST]: Record<string, never>;
  [SendChannels.PROJECT_SAVE_REQUEST]: Record<string, never>;
  [SendChannels.PROJECT_SAVE_AS_REQUEST]: Record<string, never>;
  [SendChannels.PROJECT_OPEN_REQUEST]: Record<string, never>;
  [SendChannels.PROJECT_OPEN_RECENT_REQUEST]: { path: string };
  [SendChannels.SETTINGS_OPEN_REQUEST]: Record<string, never>;
  [SendChannels.KEYBOARD_SHORTCUTS_REQUEST]: Record<string, never>;
  [SendChannels.WHATS_NEW_REQUEST]: Record<string, never>;
  [SendChannels.UPDATE_CHECK_REQUEST]: Record<string, never>;
  [SendChannels.UI_ZOOM_REQUEST]: { direction: 'in' | 'out' | 'reset' };
  [SendChannels.EDIT_UNDO_REQUEST]: Record<string, never>;
  [SendChannels.EDIT_REDO_REQUEST]: Record<string, never>;
  [SendChannels.LIFECYCLE_PREPARE]: import('./app-lifecycle').LifecyclePrepareRequest;
  [SendChannels.SYSTEM_NOTIFICATION_CLICKED]: import('./jobs').NativeNotificationClick;
  [SendChannels.UPDATE_STATE]: import('./updater').AppUpdateState;
  [SendChannels.SEGMENT_FALLBACK]: {
    clipId: string;
    segmentIndex: number;
    archetype: string;
    reason: string;
  };
  [SendChannels.AI_STITCH_PROGRESS]: {
    stage: 'sending' | 'analyzing' | 'validating';
    message: string;
  };
  [SendChannels.AI_LONGFORM_EDIT_PROGRESS]: {
    stage: 'ai-editing';
    /** 1-based index of the window currently being designed. */
    window: number;
    /** Total number of windows in the edit plan. */
    total: number;
  };
}

// ---- Helper types --------------------------------------------------------

/** Extract the data payload type for a main→renderer send channel. */
export type IpcSendData<C extends SendChannel> = C extends keyof IpcSendChannelMap
  ? IpcSendChannelMap[C]
  : never;
