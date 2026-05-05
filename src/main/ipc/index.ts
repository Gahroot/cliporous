export { registerAiHandlers } from './ai-handlers'
export { registerExportHandlers } from './export-handlers'
export { registerFfmpegHandlers } from './ffmpeg-handlers'
export { registerMediaHandlers } from './media-handlers'
export {
  registerProjectHandlers,
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject,
  type RecentProjectEntry
} from './project-handlers'
export { registerRenderHandlers } from './render-handlers'
export { registerSecretsHandlers } from './secrets-handlers'
export {
  registerSystemHandlers,
  setAutoCleanupOnExit,
  getAutoCleanupOnExit,
  deleteBatchContentTempFiles
} from './system-handlers'
