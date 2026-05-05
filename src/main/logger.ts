import { app } from 'electron'
import { createWriteStream, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { WriteStream } from 'fs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let logDir: string
let logPath: string
let stream: WriteStream | null = null
let initialized = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0')
}

function formatTimestamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
  )
}

function formatLogLine(level: LogLevel, source: string, message: string, data?: unknown): string {
  const ts = formatTimestamp(new Date())
  const lvl = level.toUpperCase().padEnd(5)
  let line = `[${ts}] [${lvl}] [${source}] ${message}`
  if (data !== undefined) {
    try {
      const json = JSON.stringify(data)
      // Truncate very large data blobs
      line += ` | ${json.length > 500 ? json.slice(0, 500) + '…' : json}`
    } catch {
      // Non-serialisable — skip
    }
  }
  return line
}

/**
 * Remove log files older than the 5 most-recent session logs.
 */
function rotateOldLogs(dir: string): void {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('session-') && f.endsWith('.log'))
      .map((f) => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime) // newest first

    // Keep last 5, delete the rest
    for (const file of files.slice(5)) {
      try { unlinkSync(file.path) } catch { /* ignore */ }
    }
  } catch {
    // Ignore rotation errors
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Initialise the file logger. Must be called after `app` is ready.
 * Safe to call multiple times — only initialises once.
 */
export function initLogger(): void {
  if (initialized) return
  initialized = true

  logDir = join(app.getPath('userData'), 'logs')
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  rotateOldLogs(logDir)

  const now = new Date()
  const dateStr =
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}` +
    `_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`
  logPath = join(logDir, `session-${dateStr}.log`)

  stream = createWriteStream(logPath, { flags: 'a', encoding: 'utf-8' })

  // Write session header
  const header = [
    '='.repeat(80),
    `BatchContent Session Log`,
    `Started: ${formatTimestamp(now)}`,
    `Platform: ${process.platform}  Arch: ${process.arch}`,
    `Node: ${process.version}  Electron: ${process.versions.electron ?? 'unknown'}`,
    '='.repeat(80),
    ''
  ].join('\n')

  stream.write(header)

  // Intercept console.log / console.error in the main process so all existing
  // calls are also written to the log file without changing call sites.
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    origLog(...args)
    writeRaw('info', args)
  }
  console.warn = (...args: unknown[]) => {
    origWarn(...args)
    writeRaw('warn', args)
  }
  console.error = (...args: unknown[]) => {
    origError(...args)
    writeRaw('error', args)
  }
}

function writeRaw(level: LogLevel, args: unknown[]): void {
  if (!stream) return
  // Extract source tag like "[Render]" from first arg if present
  const first = String(args[0] ?? '')
  const tagMatch = first.match(/^\[([^\]]+)\]/)
  const source = tagMatch ? tagMatch[1] : 'main'
  const rest = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
  const line = `[${formatTimestamp(new Date())}] [${level.toUpperCase().padEnd(5)}] [${source}] ${rest}\n`
  stream.write(line)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a structured log entry to the session log file.
 */
export function log(level: LogLevel, source: string, message: string, data?: unknown): void {
  if (!stream) return
  stream.write(formatLogLine(level, source, message, data) + '\n')
}

/**
 * Returns the absolute path to the current session log file.
 * Returns empty string if the logger hasn't been initialised yet.
 */
export function getLogPath(): string {
  return logPath ?? ''
}

/**
 * Returns the current log file size in bytes, or 0 if unavailable.
 */
export function getLogSize(): number {
  if (!logPath || !existsSync(logPath)) return 0
  try {
    return statSync(logPath).size
  } catch {
    return 0
  }
}

/**
 * Returns the path to the logs directory.
 */
export function getLogDir(): string {
  return logDir ?? ''
}

/**
 * Flush and close the log stream (call on app quit).
 */
export function closeLogger(): void {
  if (stream) {
    stream.end()
    stream = null
  }
}
