import { ipcMain, dialog, shell, Notification } from 'electron'
import { join } from 'path'
import { tmpdir, homedir, cpus, totalmem, freemem } from 'os'
import { execFile } from 'child_process'
import { readFileSync, writeFileSync, statfs, existsSync } from 'fs'
import { readdir, stat, unlink } from 'fs/promises'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'
import { getEncoder } from '../ffmpeg'
import { getLogPath, getLogSize, getLogDir, log } from '../logger'
import { getEditPlanCacheSize } from '../ai/edit-plan-cache'
import { buildRendererFontManifest } from '../font-registry'

let autoCleanupOnExit = false

export function setAutoCleanupOnExit(enabled: boolean): void {
  autoCleanupOnExit = enabled
}

export function getAutoCleanupOnExit(): boolean {
  return autoCleanupOnExit
}

async function scanBatchContentTempFiles(): Promise<string[]> {
  const found: string[] = []
  const tmp = tmpdir()

  try {
    const entries = await readdir(tmp)
    for (const name of entries) {
      if (!name.startsWith('batchcontent-')) continue
      const fullPath = join(tmp, name)
      try {
        const s = await stat(fullPath)
        if (s.isFile()) found.push(fullPath)
      } catch {
        // ignore stat errors
      }
    }
  } catch {
    // ignore readdir errors
  }

  const ytDir = join(tmp, 'batchcontent-yt')
  try {
    const entries = await readdir(ytDir)
    for (const name of entries) {
      const fullPath = join(ytDir, name)
      try {
        const s = await stat(fullPath)
        if (s.isFile()) found.push(fullPath)
      } catch { /* ignore */ }
    }
  } catch { /* directory may not exist */ }

  const brollDir = join(tmp, 'batchcontent-broll-cache')
  try {
    const entries = await readdir(brollDir)
    for (const name of entries) {
      const fullPath = join(brollDir, name)
      try {
        const s = await stat(fullPath)
        if (s.isFile()) found.push(fullPath)
      } catch { /* ignore */ }
    }
  } catch { /* directory may not exist */ }

  return found
}

export async function deleteBatchContentTempFiles(): Promise<{ deleted: number; freed: number }> {
  const files = await scanBatchContentTempFiles()
  let deleted = 0
  let freed = 0
  for (const filePath of files) {
    try {
      const s = await stat(filePath)
      await unlink(filePath)
      freed += s.size
      deleted++
    } catch { /* File may have been removed already */ }
  }
  return { deleted, freed }
}

export function registerSystemHandlers(): void {
  // Dialog — open file dialog for video selection
  ipcMain.handle(
    Ch.Invoke.DIALOG_OPEN_FILES,
    wrapHandler(Ch.Invoke.DIALOG_OPEN_FILES, async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mts', 'm4v'] }
        ]
      })
      return result.filePaths
    })
  )

  // Dialog — open directory dialog for output
  ipcMain.handle(
    Ch.Invoke.DIALOG_OPEN_DIRECTORY,
    wrapHandler(Ch.Invoke.DIALOG_OPEN_DIRECTORY, async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      return result.filePaths[0] || null
    })
  )

  // System — get disk space info
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_DISK_SPACE,
    wrapHandler(Ch.Invoke.SYSTEM_GET_DISK_SPACE, (_event, dirPath: string) => {
      return new Promise<{ free: number; total: number }>((resolve, reject) => {
        statfs(dirPath, (err, stats) => {
          if (err) { reject(err); return }
          resolve({
            free: stats.bavail * stats.bsize,
            total: stats.blocks * stats.bsize
          })
        })
      })
    })
  )

  // System — show an OS-level notification
  ipcMain.handle(
    Ch.Invoke.SYSTEM_NOTIFY,
    wrapHandler(
      Ch.Invoke.SYSTEM_NOTIFY,
      (_event, opts: { title: string; body: string; silent?: boolean }) => {
        if (!Notification.isSupported()) return
        new Notification({ title: opts.title, body: opts.body, silent: opts.silent ?? false }).show()
      }
    )
  )

  // System — get active video encoder info
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_ENCODER,
    wrapHandler(Ch.Invoke.SYSTEM_GET_ENCODER, () => {
      const { encoder } = getEncoder()
      const isHardware = encoder === 'h264_nvenc' || encoder === 'h264_qsv'
      return { encoder, isHardware }
    })
  )

  // System — enumerate available fonts (bundled via font registry + system fallbacks)
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_AVAILABLE_FONTS,
    wrapHandler(Ch.Invoke.SYSTEM_GET_AVAILABLE_FONTS, async () => {
      type FontEntry = { name: string; path: string; source: 'bundled' | 'system'; category?: string; weight?: string }
      const fonts: FontEntry[] = []

      // Bundled fonts from the font registry (proper family names + metadata)
      const manifest = buildRendererFontManifest()
      for (const entry of manifest) {
        fonts.push({
          name: entry.family,
          path: entry.path,
          source: 'bundled',
          category: entry.category,
          weight: entry.weight
        })
      }

      // System font fallbacks for machines without bundled fonts
      const SYSTEM_FONT_CANDIDATES: Array<{ name: string; path: string }> = [
        { name: 'Liberation Sans Bold', path: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' },
        { name: 'Liberation Sans', path: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf' },
        { name: 'DejaVu Sans Bold', path: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' },
        { name: 'DejaVu Sans', path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf' },
        { name: 'FreeSans Bold', path: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf' },
        { name: 'FreeSans', path: '/usr/share/fonts/truetype/freefont/FreeSans.ttf' },
        { name: 'Ubuntu Bold', path: '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf' },
        { name: 'Ubuntu', path: '/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf' },
        { name: 'Noto Sans Bold', path: '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf' },
        { name: 'Noto Sans', path: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf' },
        { name: 'Helvetica', path: '/System/Library/Fonts/Helvetica.ttc' },
        { name: 'Arial Bold', path: '/Library/Fonts/Arial Bold.ttf' },
        { name: 'Arial', path: '/Library/Fonts/Arial.ttf' },
        { name: 'Arial Bold', path: 'C:\\Windows\\Fonts\\arialbd.ttf' },
        { name: 'Arial', path: 'C:\\Windows\\Fonts\\arial.ttf' },
        { name: 'Impact', path: 'C:\\Windows\\Fonts\\impact.ttf' },
        { name: 'Calibri Bold', path: 'C:\\Windows\\Fonts\\calibrib.ttf' },
        { name: 'Calibri', path: 'C:\\Windows\\Fonts\\calibri.ttf' },
      ]

      const seenPaths = new Set(fonts.map((f) => f.path))
      for (const candidate of SYSTEM_FONT_CANDIDATES) {
        if (!seenPaths.has(candidate.path) && existsSync(candidate.path)) {
          fonts.push({ ...candidate, source: 'system' })
          seenPaths.add(candidate.path)
        }
      }

      return fonts
    })
  )

  // System — get font file data as base64 for renderer FontFace loading
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_FONT_DATA,
    wrapHandler(Ch.Invoke.SYSTEM_GET_FONT_DATA, async (_event, fontPath: string) => {
      try {
        if (!existsSync(fontPath)) return null
        const data = readFileSync(fontPath)
        return data.toString('base64')
      } catch {
        return null
      }
    })
  )

  // Shell — open a path in OS file manager
  ipcMain.handle(
    Ch.Invoke.SHELL_OPEN_PATH,
    wrapHandler(Ch.Invoke.SHELL_OPEN_PATH, async (_event, path: string) => {
      return shell.openPath(path)
    })
  )

  // Shell — show a file in its parent folder
  ipcMain.handle(
    Ch.Invoke.SHELL_SHOW_ITEM_IN_FOLDER,
    wrapHandler(Ch.Invoke.SHELL_SHOW_ITEM_IN_FOLDER, (_event, path: string) => {
      shell.showItemInFolder(path)
    })
  )

  // System — scan temp files
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_TEMP_SIZE,
    wrapHandler(
      Ch.Invoke.SYSTEM_GET_TEMP_SIZE,
      async (): Promise<{ bytes: number; count: number }> => {
        const files = await scanBatchContentTempFiles()
        let bytes = 0
        for (const filePath of files) {
          try {
            const s = await stat(filePath)
            bytes += s.size
          } catch { /* ignore */ }
        }
        return { bytes, count: files.length }
      }
    )
  )

  // System — delete all temp files
  ipcMain.handle(
    Ch.Invoke.SYSTEM_CLEANUP_TEMP,
    wrapHandler(
      Ch.Invoke.SYSTEM_CLEANUP_TEMP,
      async (): Promise<{ deleted: number; freed: number }> => {
        return deleteBatchContentTempFiles()
      }
    )
  )

  // System — get current log file path
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_LOG_PATH,
    wrapHandler(Ch.Invoke.SYSTEM_GET_LOG_PATH, (): string => {
      return getLogPath()
    })
  )

  // System — get current log file size
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_LOG_SIZE,
    wrapHandler(Ch.Invoke.SYSTEM_GET_LOG_SIZE, (): number => {
      return getLogSize()
    })
  )

  // System — export session log + renderer errors
  ipcMain.handle(
    Ch.Invoke.SYSTEM_EXPORT_LOGS,
    wrapHandler(
      Ch.Invoke.SYSTEM_EXPORT_LOGS,
      async (
        _event,
        rendererErrors: Array<{ timestamp: number; source: string; message: string; details?: string }>
      ): Promise<{ exportPath: string } | null> => {
        const result = await dialog.showOpenDialog({
          title: 'Choose Export Folder',
          properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) return null

        const exportDir = result.filePaths[0]
        const now = new Date()
        const pad = (n: number) => n.toString().padStart(2, '0')
        const stamp =
          `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
          `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
        const exportPath = join(exportDir, `batchcontent-debug-${stamp}.log`)

        const { encoder } = getEncoder()
        const nodeVersion = process.version
        const electronVersion = process.versions.electron ?? 'unknown'
        const platform = `${process.platform} ${process.arch}`

        const lines: string[] = [
          '='.repeat(80),
          'BatchContent — Full Debug Log Export',
          `Exported: ${now.toISOString()}`,
          '='.repeat(80),
          '',
          '--- System Info ---',
          `Platform:  ${platform}`,
          `Node:      ${nodeVersion}`,
          `Electron:  ${electronVersion}`,
          `Encoder:   ${encoder}`,
          `Log file:  ${getLogPath()}`,
          `Log size:  ${getLogSize()} bytes`,
          '',
        ]

        const sessionLogPath = getLogPath()
        if (sessionLogPath && existsSync(sessionLogPath)) {
          lines.push('--- Session Log (Main Process) ---')
          try {
            const logContent = readFileSync(sessionLogPath, 'utf-8')
            lines.push(logContent)
          } catch {
            lines.push('(could not read session log)')
          }
        } else {
          lines.push('--- Session Log (Main Process) ---')
          lines.push('(no session log available)')
        }

        lines.push('')
        lines.push('--- Renderer Error Log ---')
        if (rendererErrors.length === 0) {
          lines.push('(no renderer errors)')
        } else {
          for (const entry of rendererErrors) {
            const d = new Date(entry.timestamp)
            const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`
            lines.push(`[${ts}] [ERROR] [${entry.source}] ${entry.message}`)
            if (entry.details) {
              lines.push(`  → ${entry.details.slice(0, 500)}`)
            }
          }
        }

        lines.push('')
        lines.push('='.repeat(80))
        lines.push('End of log export')
        lines.push('='.repeat(80))

        writeFileSync(exportPath, lines.join('\n'), 'utf-8')
        log('info', 'Main', `Debug log exported to: ${exportPath}`)

        return { exportPath }
      }
    )
  )

  // System — open the logs directory
  ipcMain.handle(
    Ch.Invoke.SYSTEM_OPEN_LOG_FOLDER,
    wrapHandler(Ch.Invoke.SYSTEM_OPEN_LOG_FOLDER, async (): Promise<void> => {
      const dir = getLogDir()
      if (dir && existsSync(dir)) {
        shell.openPath(dir)
      }
    })
  )

  // System — get HuggingFace model cache size
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_CACHE_SIZE,
    wrapHandler(Ch.Invoke.SYSTEM_GET_CACHE_SIZE, async (): Promise<{ bytes: number }> => {
      const cacheDir = join(homedir(), '.cache', 'huggingface')
      let bytes = 0

      async function walkDir(dir: string): Promise<void> {
        let entries: string[]
        try {
          entries = await readdir(dir)
        } catch {
          return
        }
        for (const name of entries) {
          const fullPath = join(dir, name)
          try {
            const s = await stat(fullPath)
            if (s.isFile()) {
              bytes += s.size
            } else if (s.isDirectory()) {
              await walkDir(fullPath)
            }
          } catch { /* ignore */ }
        }
      }

      await walkDir(cacheDir)
      // Include AI edit plan cache size
      bytes += getEditPlanCacheSize()
      return { bytes }
    })
  )

  // System — get CPU/RAM/GPU resource usage
  ipcMain.handle(
    Ch.Invoke.SYSTEM_GET_RESOURCE_USAGE,
    wrapHandler(
      Ch.Invoke.SYSTEM_GET_RESOURCE_USAGE,
      async (): Promise<{
        cpu: { percent: number }
        ram: { usedBytes: number; totalBytes: number; appBytes: number }
        gpu: { percent: number; usedMB: number; totalMB: number; name: string } | null
      }> => {
        function getCpuSnapshot(): { idle: number; total: number }[] {
          return cpus().map((c) => {
            const times = c.times
            const total = times.user + times.nice + times.sys + times.irq + times.idle
            return { idle: times.idle, total }
          })
        }
        const snap1 = getCpuSnapshot()
        await new Promise<void>((r) => setTimeout(r, 100))
        const snap2 = getCpuSnapshot()

        let idleDelta = 0
        let totalDelta = 0
        for (let i = 0; i < snap1.length; i++) {
          idleDelta += snap2[i].idle - snap1[i].idle
          totalDelta += snap2[i].total - snap1[i].total
        }
        const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0

        const totalBytes = totalmem()
        const freeBytes = freemem()
        const usedBytes = totalBytes - freeBytes
        const appBytes = process.memoryUsage().rss

        let gpu: { percent: number; usedMB: number; totalMB: number; name: string } | null = null
        try {
          gpu = await new Promise((resolve) => {
            execFile(
              'nvidia-smi',
              ['--query-gpu=utilization.gpu,memory.used,memory.total,name', '--format=csv,noheader,nounits'],
              { timeout: 2000 },
              (err, stdout) => {
                if (err || !stdout.trim()) { resolve(null); return }
                const parts = stdout.trim().split(',').map((s) => s.trim())
                if (parts.length < 4) { resolve(null); return }
                const percent = parseInt(parts[0], 10)
                const usedMB = parseInt(parts[1], 10)
                const totalMB = parseInt(parts[2], 10)
                const name = parts.slice(3).join(',').trim()
                if (isNaN(percent) || isNaN(usedMB) || isNaN(totalMB)) { resolve(null); return }
                resolve({ percent, usedMB, totalMB, name })
              }
            )
          })
        } catch {
          gpu = null
        }

        return {
          cpu: { percent: cpuPercent },
          ram: { usedBytes, totalBytes, appBytes },
          gpu
        }
      }
    )
  )

  // System — set auto-cleanup preference
  ipcMain.handle(
    Ch.Invoke.SYSTEM_SET_AUTO_CLEANUP,
    wrapHandler(Ch.Invoke.SYSTEM_SET_AUTO_CLEANUP, (_event, enabled: boolean) => {
      autoCleanupOnExit = enabled
    })
  )
}
