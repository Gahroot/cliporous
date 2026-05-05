// ---------------------------------------------------------------------------
// Shared App Constants
//
// Named constants for values used across the Electron main process and the
// React renderer.  Import from '@shared/constants' (aliased) or via relative
// path '../../shared/constants'.
//
// RULE: Only truly cross-cutting or important magic values belong here.
//       Module-specific private constants can stay in their own file.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** Lightweight model used to validate a Gemini API key. */
export const AI_VALIDATION_MODEL = 'gemini-2.5-flash-lite'

// ---------------------------------------------------------------------------
// Scoring & Clip Defaults
// ---------------------------------------------------------------------------

/** Default minimum virality score for clip approval. */
export const DEFAULT_MIN_SCORE = 69

/** Default filename template for rendered clips. */
export const DEFAULT_FILENAME_TEMPLATE = '{source}_clip{index}_{score}'

// ---------------------------------------------------------------------------
// Concurrency / Limits
// ---------------------------------------------------------------------------

/** Max thumbnail generation tasks in flight at once. */
export const THUMB_CONCURRENCY = 3

/** Max AI usage call-history entries kept in the store. */
export const MAX_AI_USAGE_HISTORY = 200

/** Max undo snapshots kept in the global history stack. */
export const MAX_UNDO = 50

/** Max undo snapshots kept per-clip (switching clips preserves history). */
export const MAX_CLIP_UNDO = 30

/** Max recent-project entries persisted to disk. */
export const MAX_RECENT_PROJECTS = 10

/** Max ETA data-points used for progress estimation. */
export const MAX_ETA_HISTORY = 10

// ---------------------------------------------------------------------------
// Timeouts (milliseconds)
// ---------------------------------------------------------------------------

/** Transcription pipeline — up to 3 hours for long videos. */
export const TRANSCRIPTION_TIMEOUT_MS = 3 * 60 * 60 * 1000

/** YouTube / yt-dlp download — up to 2 hours. */
export const YOUTUBE_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000

/** MediaPipe face detection — up to 5 minutes per video. */
export const FACE_DETECTION_TIMEOUT_MS = 5 * 60 * 1000

/** Quick Python environment import check. */
export const PYTHON_CHECK_TIMEOUT_MS = 30_000

/** Default timeout for any Python script invocation (10 minutes). */
export const DEFAULT_PYTHON_TIMEOUT_MS = 10 * 60 * 1000
