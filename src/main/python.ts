import { spawn, execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getResolvedFfmpegPath } from './ffmpeg'

const execFileAsync = promisify(execFile)

/** Timeout for the quick Python import check (30 seconds). */
const PYTHON_CHECK_TIMEOUT_MS = 30_000

/**
 * Cached system Python fallback resolved by `findSystemFallback()`.
 * `undefined` = not yet probed; `null` = probed and nothing found.
 */
let cachedSystemFallback: string | null | undefined = undefined

/**
 * Probe a candidate Python launcher with `--version`.
 * Returns true if the executable exists on PATH and responds.
 */
function probeLauncher(bin: string, args: string[] = []): boolean {
  try {
    execFileSync(bin, [...args, '--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000
    })
    return true
  } catch {
    return false
  }
}

/**
 * Find a working system Python on PATH.
 *
 * Tried in order:
 *   Windows: `py -3` (Python launcher, bundled with python.org installer),
 *            then `python.exe`, then `python3.exe`.
 *   POSIX:   `python3`, then `python`.
 *
 * Returns the bare command (so it resolves through PATH at spawn time) plus
 * any required prefix args, or `null` if nothing usable is found.
 */
function findSystemFallback(): { bin: string; prefixArgs: string[] } | null {
  if (cachedSystemFallback === null) return null
  if (typeof cachedSystemFallback === 'string') {
    // Cached value is a JSON-encoded { bin, prefixArgs }.
    try { return JSON.parse(cachedSystemFallback) } catch { /* re-probe */ }
  }

  const candidates: { bin: string; prefixArgs: string[] }[] = process.platform === 'win32'
    ? [
        { bin: 'py', prefixArgs: ['-3'] },
        { bin: 'python', prefixArgs: [] },
        { bin: 'python3', prefixArgs: [] }
      ]
    : [
        { bin: 'python3', prefixArgs: [] },
        { bin: 'python', prefixArgs: [] }
      ]

  for (const candidate of candidates) {
    if (probeLauncher(candidate.bin, candidate.prefixArgs)) {
      console.log(
        `[Python] System fallback: ${candidate.bin} ${candidate.prefixArgs.join(' ')}`.trim()
      )
      cachedSystemFallback = JSON.stringify(candidate)
      return candidate
    }
  }

  cachedSystemFallback = null
  return null
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolved Python binary plus any prefix args required to invoke it
 * (e.g. `py -3` on Windows when only the Python launcher is on PATH).
 */
export interface ResolvedPython {
  bin: string
  prefixArgs: string[]
  /** True if this is a managed venv / embedded distribution (not a bare PATH lookup). */
  isManaged: boolean
}

/**
 * Resolve the Python binary path with all required invocation args.
 *
 * Priority order:
 * 1. userData embedded Python  (Windows auto-setup)
 * 2. userData auto-setup venv  (created by python-setup.ts on first launch)
 * 3. Packaged venv             (legacy bundled builds)
 * 4. Dev venv                  (development)
 * 5. System fallback           (probed: `py -3` / `python3` / `python`)
 */
export function resolvePython(): ResolvedPython {
  const isWin = process.platform === 'win32'

  // 1. Check userData embedded Python (Windows auto-setup, no venv)
  if (isWin) {
    const embeddedPython = join(
      app.getPath('userData'), 'python-env', 'python-3.12.8', 'python.exe'
    )
    if (existsSync(embeddedPython)) {
      return { bin: embeddedPython, prefixArgs: [], isManaged: true }
    }
  }

  // 2. Check userData venv (auto-setup location, macOS/Linux)
  const userDataVenv = join(
    app.getPath('userData'), 'python-env', 'venv',
    isWin ? join('Scripts', 'python.exe') : join('bin', 'python')
  )
  if (existsSync(userDataVenv)) {
    return { bin: userDataVenv, prefixArgs: [], isManaged: true }
  }

  // 3. Check bundled venv (packaged builds, legacy)
  const venvSubpath = isWin
    ? join('python', 'venv', 'Scripts', 'python.exe')
    : join('python', 'venv', 'bin', 'python')

  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, venvSubpath)
    if (existsSync(packaged)) {
      return { bin: packaged, prefixArgs: [], isManaged: true }
    }
    console.warn('[Python] Packaged venv not found at:', packaged)
  } else {
    // 4. Development: look for venv relative to project root
    const devVenv = join(process.cwd(), venvSubpath)
    if (existsSync(devVenv)) {
      return { bin: devVenv, prefixArgs: [], isManaged: true }
    }
    console.warn('[Python] Dev venv not found at:', devVenv, '— probing system Python')
  }

  // 5. System fallback — probe what's actually on PATH so we never hand back
  //    a name (`python`) that will spawn-ENOENT.
  const fallback = findSystemFallback()
  if (fallback) {
    return { bin: fallback.bin, prefixArgs: fallback.prefixArgs, isManaged: false }
  }

  // Nothing found. Return a sentinel so the caller can produce a clear error.
  return { bin: isWin ? 'py' : 'python3', prefixArgs: [], isManaged: false }
}

/**
 * Backwards-compat shim — returns just the binary path.
 * Prefer `resolvePython()` for new code so prefix args are honored.
 */
export function resolvePythonPath(): string {
  return resolvePython().bin
}

/**
 * Resolve the path to a Python script.
 *
 * Packaged:  <resourcesPath>/python/<scriptName>
 * Dev:       <projectRoot>/python/<scriptName>
 */
export function resolveScriptPath(scriptName: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', scriptName)
  }
  return join(process.cwd(), 'python', scriptName)
}

// ---------------------------------------------------------------------------
// Script runner
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** Timeout in milliseconds. Default: 10 minutes. */
  timeoutMs?: number
  /** Called with each line of stderr (progress reporting). */
  onStderr?: (line: string) => void
  /** Called with each line of stdout as it arrives (streaming output). */
  onStdout?: (line: string) => void
}

/**
 * Spawn a Python script as a child process.
 *
 * @returns Promise<string> — the full stdout output (expected to be JSON).
 * @throws  Error if the process times out, exits with non-zero code, or fails to spawn.
 */
export function runPythonScript(
  scriptName: string,
  args: string[],
  options: RunOptions = {}
): Promise<string> {
  const { timeoutMs = 10 * 60 * 1000, onStderr, onStdout } = options

  return new Promise((resolve, reject) => {
    const resolved = resolvePython()
    const { bin: pythonBin, prefixArgs, isManaged } = resolved
    const scriptPath = resolveScriptPath(scriptName)

    if (!existsSync(scriptPath)) {
      return reject(new Error(`Python script not found: ${scriptPath}`))
    }

    // Build env with ffmpeg's directory on PATH so pydub/NeMo can find it
    const spawnEnv: Record<string, string> = { ...process.env as Record<string, string>, PYTHONUNBUFFERED: '1' }
    const ffmpegBin = getResolvedFfmpegPath()
    if (ffmpegBin) {
      const ffmpegDir = dirname(ffmpegBin)
      const sep = process.platform === 'win32' ? ';' : ':'
      spawnEnv.PATH = ffmpegDir + sep + (spawnEnv.PATH || '')
    }

    const proc = spawn(pythonBin, [...prefixArgs, scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv
    })

    let stdout = ''
    let stderrBuf = ''
    let timedOut = false

    // Timeout guard
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
      // Give it 5 s then hard kill
      setTimeout(() => proc.kill('SIGKILL'), 5000)
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (onStdout) {
        const lines = text.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) onStdout(trimmed)
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrBuf += text
      if (onStderr) {
        const lines = text.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) onStderr(trimmed)
        }
      }
    })

    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (err.code === 'ENOENT') {
        const launcher = [pythonBin, ...prefixArgs].join(' ')
        const hint = isManaged
          ? `The managed Python environment was expected at "${pythonBin}" but is missing. ` +
            `Open Settings → Python Setup and run the installer.`
          : `No Python interpreter was found on PATH (tried "${launcher}"). ` +
            `Open Settings → Python Setup to install a managed Python runtime, ` +
            `or install Python 3.10+ from https://python.org and restart the app.`
        return reject(new Error(`Failed to spawn Python process: ${hint}`))
      }
      reject(new Error(`Failed to spawn Python process: ${err.message}`))
    })

    proc.on('close', (code) => {
      clearTimeout(timer)

      if (timedOut) {
        return reject(new Error(`Python script '${scriptName}' timed out after ${timeoutMs / 1000}s`))
      }

      if (code !== 0) {
        const stderrTail = stderrBuf.trim().slice(-2000)
        return reject(
          new Error(
            `Python script '${scriptName}' exited with code ${code}.\n` +
            `Python binary: ${pythonBin}\n` +
            `Script path: ${scriptPath}\n` +
            `Stderr: ${stderrTail || '(empty)'}`
          )
        )
      }

      resolve(stdout.trim())
    })
  })
}

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------

/**
 * Check whether the Python environment exists and core packages are importable.
 * Returns true if the venv Python binary exists and can import key modules.
 */
export async function isPythonAvailable(): Promise<boolean> {
  const { bin: pythonBin, prefixArgs, isManaged } = resolvePython()

  // For a managed binary (venv/embedded) the path must exist on disk.
  // For an unmanaged PATH lookup, `findSystemFallback()` already probed it.
  if (isManaged && !existsSync(pythonBin)) {
    console.log('[Python] Binary not found:', pythonBin)
    return false
  }

  try {
    // Quick import check for the two heavyweight packages
    await execFileAsync(
      pythonBin,
      [...prefixArgs, '-c', 'import nemo; import mediapipe; import yt_dlp'],
      {
        timeout: PYTHON_CHECK_TIMEOUT_MS,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      }
    )
    console.log('[Python] Environment OK:', [pythonBin, ...prefixArgs].join(' '))
    return true
  } catch (err) {
    console.warn('[Python] Environment check failed:', (err as Error).message?.slice(0, 300))
    return false
  }
}

/**
 * Create a venv and install requirements.txt.
 * Intended for dev setup only — not called in packaged builds.
 */
export async function setupPythonVenv(): Promise<void> {
  const projectRoot = process.cwd()
  const pythonDir = join(projectRoot, 'python')
  const requirementsPath = join(pythonDir, 'requirements.txt')
  const venvDir = join(pythonDir, 'venv')

  if (!existsSync(requirementsPath)) {
    throw new Error(`requirements.txt not found at: ${requirementsPath}`)
  }

  console.log('[Python] Creating virtual environment at:', venvDir)

  const systemPython = process.platform === 'win32' ? 'python' : 'python3'
  execFileSync(systemPython, ['-m', 'venv', venvDir], { stdio: 'inherit' })

  const pipBin = process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'pip')
    : join(venvDir, 'bin', 'pip')

  console.log('[Python] Installing requirements...')
  execFileSync(pipBin, ['install', '-r', requirementsPath], { stdio: 'inherit' })

  console.log('[Python] Setup complete.')
}
