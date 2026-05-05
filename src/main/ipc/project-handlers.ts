import { app, ipcMain, dialog } from 'electron'
import { dirname, join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'

const MAX_RECENT_PROJECTS = 10

export interface RecentProjectEntry {
  path: string
  name: string
  lastOpened: number
  clipCount: number
  sourceCount: number
}

function getRecentProjectsFilePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

export function loadRecentProjects(): RecentProjectEntry[] {
  try {
    const filePath = getRecentProjectsFilePath()
    if (!existsSync(filePath)) return []
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as RecentProjectEntry[]
  } catch {
    return []
  }
}

export function saveRecentProjects(entries: RecentProjectEntry[]): void {
  try {
    const filePath = getRecentProjectsFilePath()
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8')
  } catch {
    // Silently ignore write errors
  }
}

export function addRecentProject(entry: RecentProjectEntry): void {
  const entries = loadRecentProjects()
  const filtered = entries.filter((e) => e.path !== entry.path)
  const updated = [entry, ...filtered].slice(0, MAX_RECENT_PROJECTS)
  saveRecentProjects(updated)
  try { app.addRecentDocument(entry.path) } catch { /* ignore on Linux */ }
}

function buildRecentEntry(filePath: string, json: string): RecentProjectEntry {
  const project = JSON.parse(json)
  const name = filePath.split('/').pop()?.replace('.batchcontent', '') ?? 'Untitled'
  return {
    path: filePath,
    name,
    lastOpened: Date.now(),
    clipCount: Object.values(project.clips ?? {}).flat().length,
    sourceCount: (project.sources ?? []).length
  }
}

/** Record a file in the recent-projects list, silently ignoring errors. */
function trackRecentProject(filePath: string, json: string): void {
  try {
    addRecentProject(buildRecentEntry(filePath, json))
  } catch { /* ignore metadata extraction errors */ }
}

export function registerProjectHandlers(): void {
  // Project — get recent projects list
  ipcMain.handle(
    Ch.Invoke.PROJECT_GET_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_GET_RECENT, (): RecentProjectEntry[] => {
      return loadRecentProjects()
    })
  )

  // Project — add a project to the recent list
  ipcMain.handle(
    Ch.Invoke.PROJECT_ADD_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_ADD_RECENT, (_event, entry: RecentProjectEntry) => {
      addRecentProject(entry)
    })
  )

  // Project — remove a specific path from the recent list
  ipcMain.handle(
    Ch.Invoke.PROJECT_REMOVE_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_REMOVE_RECENT, (_event, path: string) => {
      const entries = loadRecentProjects().filter((e) => e.path !== path)
      saveRecentProjects(entries)
    })
  )

  // Project — clear the entire recent list
  ipcMain.handle(
    Ch.Invoke.PROJECT_CLEAR_RECENT,
    wrapHandler(Ch.Invoke.PROJECT_CLEAR_RECENT, () => {
      saveRecentProjects([])
      try { app.clearRecentDocuments() } catch { /* ignore on Linux */ }
    })
  )

  // Project — save project JSON to a .batchcontent file chosen by user
  ipcMain.handle(
    Ch.Invoke.PROJECT_SAVE,
    wrapHandler(Ch.Invoke.PROJECT_SAVE, async (_event, json: string) => {
      const result = await dialog.showSaveDialog({
        title: 'Save Project',
        defaultPath: 'project.batchcontent',
        filters: [{ name: 'BatchContent Project', extensions: ['batchcontent'] }]
      })
      if (result.canceled || !result.filePath) return null
      writeFileSync(result.filePath, json, 'utf-8')
      trackRecentProject(result.filePath, json)
      return result.filePath
    })
  )

  // Project — load project JSON from a .batchcontent file chosen by user
  ipcMain.handle(
    Ch.Invoke.PROJECT_LOAD,
    wrapHandler(Ch.Invoke.PROJECT_LOAD, async () => {
      const result = await dialog.showOpenDialog({
        title: 'Open Project',
        properties: ['openFile'],
        filters: [{ name: 'BatchContent Project', extensions: ['batchcontent'] }]
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const filePath = result.filePaths[0]
      const data = readFileSync(filePath, 'utf-8')
      trackRecentProject(filePath, data)
      return data
    })
  )

  // Project — auto-save project JSON to a fixed recovery file in userData
  ipcMain.handle(
    Ch.Invoke.PROJECT_AUTO_SAVE,
    wrapHandler(Ch.Invoke.PROJECT_AUTO_SAVE, async (_event, json: string) => {
      const recoveryDir = join(app.getPath('userData'), 'recovery')
      if (!existsSync(recoveryDir)) mkdirSync(recoveryDir, { recursive: true })
      const recoveryPath = join(recoveryDir, 'autosave.batchcontent')
      writeFileSync(recoveryPath, json, 'utf-8')
      return recoveryPath
    })
  )

  // Project — check for and load recovery file
  ipcMain.handle(
    Ch.Invoke.PROJECT_LOAD_RECOVERY,
    wrapHandler(Ch.Invoke.PROJECT_LOAD_RECOVERY, async () => {
      const recoveryPath = join(app.getPath('userData'), 'recovery', 'autosave.batchcontent')
      if (!existsSync(recoveryPath)) return null
      return readFileSync(recoveryPath, 'utf-8')
    })
  )

  // Project — delete recovery file after successful manual save
  ipcMain.handle(
    Ch.Invoke.PROJECT_CLEAR_RECOVERY,
    wrapHandler(Ch.Invoke.PROJECT_CLEAR_RECOVERY, async () => {
      const recoveryPath = join(app.getPath('userData'), 'recovery', 'autosave.batchcontent')
      if (existsSync(recoveryPath)) {
        unlinkSync(recoveryPath)
      }
    })
  )

  // Project — load project JSON from a specific path (recent project click)
  ipcMain.handle(
    Ch.Invoke.PROJECT_LOAD_FROM_PATH,
    wrapHandler(Ch.Invoke.PROJECT_LOAD_FROM_PATH, async (_event, filePath: string) => {
      if (!existsSync(filePath)) return null
      const data = readFileSync(filePath, 'utf-8')
      trackRecentProject(filePath, data)
      return data
    })
  )
}
