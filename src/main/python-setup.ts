import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { IncomingMessage } from 'http'
import type { WebContents } from 'electron'
import { Ch } from '@shared/ipc-channels'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PythonSetupStatus {
  ready: boolean
  stage: string
  venvPath: string | null
  embeddedPythonAvailable: boolean
}

export interface PythonSetupProgress {
  stage: 'downloading-python' | 'extracting' | 'creating-venv' | 'installing-packages' | 'verifying'
  message: string
  percent: number
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Root directory for the auto-managed Python env inside userData. */
function getPythonEnvDir(): string {
  const dir = join(app.getPath('userData'), 'python-env')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Path to the venv inside the python-env directory. */
function getVenvDir(): string {
  return join(getPythonEnvDir(), 'venv')
}

/** Path to the requirements digest stamp — proves "these exact requirements are installed". */
function getStampPath(): string {
  return join(getPythonEnvDir(), 'requirements.sha256')
}

/** SHA-256 hex digest of a file's contents, or `null` if the file is unreadable. */
function hashFile(path: string): string | null {
  try {
    const content = readFileSync(path)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}

/** Read the stamped digest from a previous successful install, or `null`. */
function readStamp(): string | null {
  try {
    return readFileSync(getStampPath(), 'utf-8').trim()
  } catch {
    return null
  }
}

/** Persist the current requirements digest as a stamp marking install success. */
function writeStamp(digest: string): void {
  try {
    writeFileSync(getStampPath(), digest, 'utf-8')
  } catch (err) {
    console.warn('[PythonSetup] Failed to write stamp:', (err as Error).message)
  }
}

/** Path to the venv Python binary. */
function getVenvPythonPath(): string {
  const venvDir = getVenvDir()
  return process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python')
}

/**
 * On Windows with embedded Python, we install packages directly into the
 * embedded distribution (no venv). This returns the embedded python.exe path
 * which is also the "active" Python for running scripts.
 */
function getEffectivePythonPath(): string {
  if (process.platform === 'win32') {
    const embeddedExe = getEmbeddedPythonExe()
    if (existsSync(embeddedExe)) return embeddedExe
  }
  return getVenvPythonPath()
}

/** Resolve the bundled (or dev) requirements.txt path. */
function getRequirementsPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', 'requirements.txt')
  }
  return join(process.cwd(), 'python', 'requirements.txt')
}

// ---------------------------------------------------------------------------
// Embedded Python (Windows)
// ---------------------------------------------------------------------------

const PYTHON_VERSION = '3.12.8'
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`
const PYTHON_DIR_NAME = `python-${PYTHON_VERSION}`

function getEmbeddedPythonDir(): string {
  return join(getPythonEnvDir(), PYTHON_DIR_NAME)
}

function getEmbeddedPythonExe(): string {
  return join(getEmbeddedPythonDir(), 'python.exe')
}

/** Download a file from a URL with progress reporting. */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : require('http')
    protocol.get(url, { headers: { 'User-Agent': 'BatchContent-App' } }, (res: IncomingMessage) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode}: ${url}`))
        return
      }
      const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
      let downloadedBytes = 0
      const file = createWriteStream(destPath)
      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length
        if (totalBytes > 0 && onProgress) {
          onProgress(Math.round((downloadedBytes / totalBytes) * 100))
        }
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
      file.on('error', (err) => {
        file.close()
        reject(err)
      })
    }).on('error', reject)
  })
}

/** Extract a zip file to a destination directory (cross-platform). */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  if (process.platform === 'win32') {
    // Use PowerShell's Expand-Archive on Windows
    await execFileAsync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
    ], { timeout: 120_000 })
  } else {
    // Use unzip on macOS/Linux
    await execFileAsync('unzip', ['-o', zipPath, '-d', destDir], { timeout: 120_000 })
  }
}

/**
 * Ensure embedded Python is downloaded and extracted (Windows only).
 * On macOS/Linux this is a no-op — we use system python3.
 */
async function ensureEmbeddedPython(
  onProgress?: (stage: string, message: string, percent: number) => void
): Promise<string> {
  if (process.platform !== 'win32') {
    return findSystemPython()
  }

  const pythonExe = getEmbeddedPythonExe()
  if (existsSync(pythonExe)) {
    console.log('[PythonSetup] Embedded Python already exists:', pythonExe)
    return pythonExe
  }

  const envDir = getPythonEnvDir()
  const zipPath = join(envDir, `python-${PYTHON_VERSION}-embed-amd64.zip`)

  // Download
  onProgress?.('downloading-python', 'Downloading Python runtime...', 0)
  await downloadFile(PYTHON_ZIP_URL, zipPath, (pct) => {
    onProgress?.('downloading-python', `Downloading Python runtime... ${pct}%`, pct)
  })

  // Extract
  onProgress?.('extracting', 'Extracting Python...', 0)
  const extractDir = getEmbeddedPythonDir()
  await extractZip(zipPath, extractDir)
  onProgress?.('extracting', 'Python extracted', 100)

  // Patch ._pth to enable pip (uncomment "import site")
  const pthName = `python${PYTHON_VERSION.replace(/\./g, '').slice(0, 3)}._pth`
  const pthPath = join(extractDir, pthName)
  if (existsSync(pthPath)) {
    let pthContent = readFileSync(pthPath, 'utf-8')
    pthContent = pthContent.replace(/^#\s*import site/m, 'import site')
    writeFileSync(pthPath, pthContent, 'utf-8')
    console.log('[PythonSetup] Patched', pthName, 'to enable pip')
  }

  // Install pip via get-pip.py
  const getPipPath = join(envDir, 'get-pip.py')
  onProgress?.('extracting', 'Installing pip...', 50)
  await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(pythonExe, [getPipPath], {
      cwd: extractDir,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`get-pip.py failed (code ${code}): ${stderr.slice(-500)}`))
      else resolve()
    })
  })

  onProgress?.('extracting', 'Python runtime ready', 100)
  return pythonExe
}

// ---------------------------------------------------------------------------
// System Python (macOS/Linux)
// ---------------------------------------------------------------------------

/**
 * Probe a candidate python binary and return its (major, minor) version,
 * or null if it can't be executed.
 */
function probePythonVersion(
  bin: string
): { bin: string; major: number; minor: number } | null {
  const { execFileSync: execSync } = require('child_process') as typeof import('child_process')
  try {
    const output = execSync(bin, ['--version'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe']
    }) as string
    const versionStr = String(output).trim()
    const match = versionStr.match(/Python (\d+)\.(\d+)/)
    if (!match) return null
    return { bin, major: parseInt(match[1], 10), minor: parseInt(match[2], 10) }
  } catch {
    return null
  }
}

/**
 * On macOS, install python@3.12 via Homebrew if it is available. Returns the
 * absolute path to the installed binary, or null if Homebrew is not present
 * or the install failed.
 */
function tryInstallViaHomebrew(): string | null {
  if (process.platform !== 'darwin') return null
  const { execFileSync: execSync } = require('child_process') as typeof import('child_process')
  let brewBin: string
  try {
    brewBin = (execSync('command', ['-v', 'brew'], {
      encoding: 'utf-8',
      shell: '/bin/bash' as never,
      timeout: 5_000
    }) as string).trim()
    if (!brewBin) return null
  } catch {
    return null
  }

  console.log('[PythonSetup] Installing python@3.12 via Homebrew (this may take a few minutes)...')
  try {
    execSync(brewBin, ['install', 'python@3.12'], {
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 600_000
    })
  } catch (err) {
    console.warn('[PythonSetup] brew install python@3.12 failed:', (err as Error).message)
    return null
  }

  // Resolve the installed binary — try both Apple Silicon and Intel prefixes.
  for (const candidate of ['/opt/homebrew/bin/python3.12', '/usr/local/bin/python3.12']) {
    if (existsSync(candidate)) {
      console.log('[PythonSetup] Homebrew python installed at:', candidate)
      return candidate
    }
  }
  return null
}

/**
 * Find a suitable system Python binary.
 *
 * NeMo requires Python >= 3.10 — older Pythons (notably macOS's stock
 * /usr/bin/python3, which is 3.9) cannot install `nemo_toolkit[asr]` because
 * its transitive `youtokentome` dep does not build cleanly. We probe specific
 * versioned candidates first so that we don't get tricked into using whatever
 * `python3` happens to point at.
 *
 * On macOS we will offer to install `python@3.12` via Homebrew if no suitable
 * interpreter is found and `brew` is available.
 */
function findSystemPython(): string {
  // Prefer specific 3.10+ versions over generic `python3`/`python`, which on
  // macOS commonly resolves to 3.9. Order: most-tested first.
  const candidates = [
    'python3.12',
    'python3.11',
    'python3.13',
    'python3.10',
    'python3',
    'python'
  ]

  for (const bin of candidates) {
    const probe = probePythonVersion(bin)
    if (probe && probe.major === 3 && probe.minor >= 10) {
      console.log(`[PythonSetup] Found system Python: ${probe.bin} (${probe.major}.${probe.minor})`)
      return probe.bin
    }
  }

  // None of the candidates met the >=3.10 requirement. On macOS, try to
  // install python@3.12 via Homebrew automatically.
  const brewInstalled = tryInstallViaHomebrew()
  if (brewInstalled) return brewInstalled

  // Last-ditch diagnostic: report what we *did* find so the error message is
  // actionable instead of generic.
  const found = candidates
    .map(probePythonVersion)
    .filter((p): p is NonNullable<ReturnType<typeof probePythonVersion>> => p !== null)
    .map((p) => `${p.bin} (${p.major}.${p.minor})`)
    .join(', ') || 'none'

  throw new Error(
    `Python 3.10+ is required but not found (detected: ${found}). ` +
    (process.platform === 'darwin'
      ? 'Install via Homebrew: `brew install python@3.12`, or download from https://python.org'
      : 'Please install Python 3.10+ from https://python.org')
  )
}

// ---------------------------------------------------------------------------
// Venv creation + pip install
// ---------------------------------------------------------------------------

/**
 * Check if we're using the Windows embedded Python (which has no venv module).
 * In that case we install packages directly into the embedded distribution.
 */
function isUsingEmbeddedPython(pythonBin: string): boolean {
  if (process.platform !== 'win32') return false
  const embeddedExe = getEmbeddedPythonExe()
  // Normalize paths for comparison
  return pythonBin.toLowerCase() === embeddedExe.toLowerCase()
}

/**
 * Create a venv (or use embedded Python directly on Windows) and install
 * packages from requirements.txt. Sends progress updates via the callback.
 */
async function createVenvAndInstall(
  pythonBin: string,
  onProgress?: (stage: string, message: string, percent: number, pkg?: string, currentPkg?: number, totalPkgs?: number) => void
): Promise<void> {
  const useEmbedded = isUsingEmbeddedPython(pythonBin)

  // The Python binary we'll use for pip operations
  let activePython: string

  if (useEmbedded) {
    // Windows embedded Python: skip venv, install packages directly
    console.log('[PythonSetup] Using embedded Python directly (no venv):', pythonBin)
    onProgress?.('creating-venv', 'Using embedded Python (no venv needed)...', 100)
    activePython = pythonBin
  } else {
    // macOS/Linux or system Python: create a proper venv
    const venvDir = getVenvDir()
    const venvPython = getVenvPythonPath()

    // If a venv already exists but was created with a Python <3.10, it cannot
    // install nemo_toolkit. Detect and nuke it so we recreate with the new
    // interpreter we just resolved.
    if (existsSync(venvPython)) {
      const existing = probePythonVersion(venvPython)
      if (!existing || existing.major !== 3 || existing.minor < 10) {
        const { rmSync } = require('fs') as typeof import('fs')
        console.warn(
          `[PythonSetup] Existing venv uses Python ${existing ? `${existing.major}.${existing.minor}` : 'unknown'} — recreating with ${pythonBin}`
        )
        try { rmSync(venvDir, { recursive: true, force: true }) } catch { /* best-effort */ }
      }
    }

    if (!existsSync(venvPython)) {
      onProgress?.('creating-venv', 'Creating virtual environment...', 0)
      console.log('[PythonSetup] Creating venv at:', venvDir)

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(pythonBin, ['-m', 'venv', venvDir], {
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let stderr = ''
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
        proc.on('error', reject)
        proc.on('close', (code) => {
          if (code !== 0) reject(new Error(`venv creation failed (code ${code}): ${stderr.slice(-500)}`))
          else resolve()
        })
      })

      onProgress?.('creating-venv', 'Virtual environment created', 100)
    }

    activePython = venvPython
  }

  // Copy requirements.txt to the python-env directory for reference
  const srcReq = getRequirementsPath()
  const destReq = join(getPythonEnvDir(), 'requirements.txt')
  if (existsSync(srcReq)) {
    copyFileSync(srcReq, destReq)
  }

  // Upgrade pip first
  // Cython is included up-front because nemo_toolkit's transitive `youtokentome`
  // dep doesn't declare it as a build requirement and will fail in pip's
  // isolated build env without it. See NVIDIA-NeMo/NeMo discussion #8301.
  onProgress?.('installing-packages', 'Installing build tools (pip, setuptools, wheel, Cython)...', 2)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(activePython, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', 'Cython'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn('[PythonSetup] pip upgrade warning:', stderr.slice(-300))
      }
      resolve()
    })
  })

  // Install packages from requirements.txt
  onProgress?.('installing-packages', 'Installing AI packages (this may take 10–30 minutes)...', 5)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      activePython,
      ['-m', 'pip', 'install', '--progress-bar', 'off', '-r', destReq],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      }
    )

    let lineCount = 0
    let stderr = ''
    let downloadingCount = 0
    // Known heavy packages with approximate sizes for user-facing labels
    const KNOWN_PACKAGES: Record<string, string> = {
      torch: 'PyTorch (~2 GB)',
      nemo: 'NeMo ASR (~500 MB)',
      nemo_toolkit: 'NeMo Toolkit (~500 MB)',
      mediapipe: 'MediaPipe (~50 MB)',
      opencv: 'OpenCV (~30 MB)',
      'opencv-python': 'OpenCV (~30 MB)',
      'yt-dlp': 'yt-dlp (~15 MB)',
      yt_dlp: 'yt-dlp (~15 MB)',
      numpy: 'NumPy (~20 MB)',
      torchaudio: 'TorchAudio (~200 MB)',
    }

    function getPackageLabel(line: string): string {
      for (const [key, label] of Object.entries(KNOWN_PACKAGES)) {
        if (new RegExp(key, 'i').test(line)) return label
      }
      // Extract package name from pip output like "Collecting packagename" or "Downloading packagename-x.y.z"
      const match = line.match(/(?:Collecting|Downloading)\s+([\w\-_.]+)/i)
      return match ? match[1] : line.slice(0, 40)
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      const lines = text.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        lineCount++

        // Estimate progress: pip install typically outputs ~150-300 lines for
        // a heavy install. We map lineCount to roughly 5-92%.
        const estimatedPct = Math.min(92, 5 + Math.round((lineCount / 250) * 87))

        let message = 'Installing packages...'
        let pkgLabel: string | undefined

        if (/^Collecting\s/i.test(trimmed)) {
          downloadingCount++
          pkgLabel = getPackageLabel(trimmed)
          message = `Resolving ${pkgLabel}...`
          onProgress?.('installing-packages', message, estimatedPct,
            pkgLabel, downloadingCount, undefined)
        } else if (/^Downloading\s/i.test(trimmed)) {
          pkgLabel = getPackageLabel(trimmed)
          // Extract size if present: "Downloading torch-2.0.0.tar.gz (1.2 GB)"
          const sizeMatch = trimmed.match(/\(([^)]+)\)/)
          const sizeLabel = sizeMatch ? ` (${sizeMatch[1]})` : ''
          message = `Downloading ${pkgLabel}${sizeLabel}...`
          onProgress?.('installing-packages', message, estimatedPct,
            pkgLabel, downloadingCount, undefined)
        } else if (/^Installing collected packages/i.test(trimmed)) {
          message = 'Installing collected packages...'
          onProgress?.('installing-packages', message, Math.max(estimatedPct, 85),
            undefined, undefined, undefined)
        } else if (/^Building wheel/i.test(trimmed)) {
          pkgLabel = getPackageLabel(trimmed)
          message = `Building ${pkgLabel}...`
          onProgress?.('installing-packages', message, estimatedPct,
            pkgLabel, undefined, undefined)
        } else if (/^Successfully installed/i.test(trimmed)) {
          message = 'All packages installed successfully!'
          onProgress?.('installing-packages', message, 93,
            undefined, undefined, undefined)
        } else {
          onProgress?.('installing-packages', message, estimatedPct,
            undefined, undefined, undefined)
        }
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(
          `pip install failed (code ${code}): ${stderr.slice(-1000)}`
        ))
      } else {
        resolve()
      }
    })
  })

  onProgress?.('installing-packages', 'Packages installed successfully', 95)
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verifyInstallation(): Promise<boolean> {
  const pythonBin = getEffectivePythonPath()
  if (!existsSync(pythonBin)) return false

  try {
    await execFileAsync(pythonBin, ['-c', 'import nemo; import mediapipe; import yt_dlp'], {
      timeout: 60_000,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })
    console.log('[PythonSetup] Verification OK:', pythonBin)
    return true
  } catch (err) {
    console.warn('[PythonSetup] Verification failed:', pythonBin, (err as Error).message?.slice(0, 300))
    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the Python environment is set up and ready.
 */
export async function checkPythonSetup(): Promise<PythonSetupStatus> {
  const effectivePython = getEffectivePythonPath()
  const pythonExists = existsSync(effectivePython)
  const embeddedExists = process.platform === 'win32' && existsSync(getEmbeddedPythonExe())

  console.log(`[PythonSetup] checkPythonSetup — effective: ${effectivePython} (exists: ${pythonExists})`)

  if (!pythonExists) {
    return {
      ready: false,
      stage: 'not-setup',
      venvPath: null,
      embeddedPythonAvailable: embeddedExists
    }
  }

  // Quick import check
  const importOk = await verifyInstallation()

  return {
    ready: importOk,
    stage: importOk ? 'ready' : 'incomplete',
    venvPath: pythonExists ? (embeddedExists ? getEmbeddedPythonDir() : getVenvDir()) : null,
    embeddedPythonAvailable: embeddedExists
  }
}

/**
 * Run the full Python setup: download embedded Python (Windows), create venv,
 * install packages, and verify. Sends progress events to the renderer.
 */
export async function runFullSetup(sender: WebContents): Promise<void> {
  const sendProgress = (
    stage: PythonSetupProgress['stage'],
    message: string,
    percent: number,
    pkg?: string,
    currentPkg?: number,
    totalPkgs?: number
  ): void => {
    sender.send(Ch.Send.PYTHON_SETUP_PROGRESS, { stage, message, percent, package: pkg, currentPackage: currentPkg, totalPackages: totalPkgs })
  }

  try {
    // 1. Ensure we have a Python binary
    sendProgress('downloading-python', 'Checking Python availability...', 0)
    const pythonBin = await ensureEmbeddedPython((stage, message, percent) => {
      sendProgress(stage as PythonSetupProgress['stage'], message, percent)
    })
    console.log('[PythonSetup] Using Python binary:', pythonBin)

    // 2. Create venv + install packages
    await createVenvAndInstall(pythonBin, (stage, message, percent, pkg, currentPkg, totalPkgs) => {
      sendProgress(stage as PythonSetupProgress['stage'], message, percent, pkg, currentPkg, totalPkgs)
    })

    // 3. Verify
    sendProgress('verifying', 'Verifying installation...', 95)
    const ok = await verifyInstallation()
    if (!ok) {
      throw new Error('Verification failed: one or more packages could not be imported')
    }

    // Stamp the requirements digest so future launches skip the install entirely.
    const reqDigest = hashFile(getRequirementsPath())
    if (reqDigest) writeStamp(reqDigest)

    sendProgress('verifying', 'Setup complete!', 100)
    sender.send(Ch.Send.PYTHON_SETUP_DONE, { success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PythonSetup] Setup failed:', message)
    sender.send(Ch.Send.PYTHON_SETUP_DONE, { success: false, error: message })
  }
}

// ---------------------------------------------------------------------------
// ensurePythonReady — self-healing first-run / cold-start setup
// ---------------------------------------------------------------------------

/**
 * Concurrency guard — a single in-flight setup promise shared by every caller
 * (startup probe + IPC handlers racing to ensure readiness on first paste).
 */
let inFlightSetup: Promise<EnsureReadyResult> | null = null

export interface EnsureReadyResult {
  ready: boolean
  /** Whether an install was actually performed (vs. fast-path stamp hit). */
  installed: boolean
  /** Error message if `ready === false`. */
  error?: string
}

export interface EnsureReadyOptions {
  /**
   * Optional progress sink. When provided, install progress events are
   * forwarded here verbatim. Used by the main process to relay events to
   * renderer windows via `Ch.Send.PYTHON_SETUP_PROGRESS`.
   */
  onProgress?: (
    stage: PythonSetupProgress['stage'],
    message: string,
    percent: number,
    pkg?: string,
    currentPkg?: number,
    totalPkgs?: number
  ) => void
}

/**
 * Quick smoke test: does the resolved Python binary import every package the
 * pipeline actually needs? Used for the warm-path fast check (separate from
 * `verifyInstallation()` so we can keep the timeout tight).
 */
async function quickImportCheck(pythonBin: string): Promise<boolean> {
  if (!existsSync(pythonBin)) return false
  try {
    await execFileAsync(
      pythonBin,
      ['-c', 'import nemo, mediapipe, yt_dlp'],
      { timeout: 15_000, env: { ...process.env, PYTHONUNBUFFERED: '1' } }
    )
    return true
  } catch {
    return false
  }
}

/**
 * Idempotent, self-healing Python setup.
 *
 * Fast path (every launch after the first):
 *   1. The Python binary exists.
 *   2. `requirements.sha256` matches the current `requirements.txt`.
 *   3. A 15-second `python -c "import nemo, mediapipe, yt_dlp"` passes.
 *   → returns `{ ready: true, installed: false }` in <1s.
 *
 * Slow path (first run, app update with new requirements, or corrupted env):
 *   Runs `ensureEmbeddedPython()` + `createVenvAndInstall()` + `verifyInstallation()`,
 *   stamps the new digest on success, returns `{ ready: true, installed: true }`.
 *
 * Concurrency-safe — multiple concurrent callers share one in-flight setup.
 */
export async function ensurePythonReady(
  options: EnsureReadyOptions = {}
): Promise<EnsureReadyResult> {
  if (inFlightSetup) return inFlightSetup

  inFlightSetup = (async (): Promise<EnsureReadyResult> => {
    const effectivePython = getEffectivePythonPath()
    const reqPath = getRequirementsPath()
    const currentDigest = hashFile(reqPath)
    const stampedDigest = readStamp()

    // Fast path: stamp matches and packages still import. Skip everything.
    if (
      currentDigest &&
      stampedDigest === currentDigest &&
      existsSync(effectivePython) &&
      (await quickImportCheck(effectivePython))
    ) {
      console.log('[PythonSetup] Fast path — stamp matches, env is ready')
      return { ready: true, installed: false }
    }

    console.log('[PythonSetup] Slow path — install/repair required', {
      hasBinary: existsSync(effectivePython),
      stampMatches: stampedDigest === currentDigest,
    })

    try {
      // 1. Ensure a Python binary exists (downloads embedded Python on Windows).
      const pythonBin = await ensureEmbeddedPython((stage, message, percent) => {
        options.onProgress?.(
          stage as PythonSetupProgress['stage'],
          message,
          percent
        )
      })

      // 2. Create venv (or use embedded Python directly) and install requirements.
      await createVenvAndInstall(
        pythonBin,
        (stage, message, percent, pkg, currentPkg, totalPkgs) => {
          options.onProgress?.(
            stage as PythonSetupProgress['stage'],
            message,
            percent,
            pkg,
            currentPkg,
            totalPkgs
          )
        }
      )

      // 3. Verify imports work.
      options.onProgress?.('verifying', 'Verifying installation...', 95)
      const ok = await verifyInstallation()
      if (!ok) {
        return {
          ready: false,
          installed: true,
          error: 'Verification failed: one or more packages could not be imported',
        }
      }

      // 4. Stamp success.
      if (currentDigest) writeStamp(currentDigest)
      options.onProgress?.('verifying', 'Setup complete!', 100)
      return { ready: true, installed: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[PythonSetup] ensurePythonReady failed:', message)
      return { ready: false, installed: false, error: message }
    }
  })()

  try {
    return await inFlightSetup
  } finally {
    inFlightSetup = null
  }
}

/**
 * Cheap synchronous check — does the env *look* ready without spawning a
 * Python process? Used by IPC handlers that want to fail fast before doing
 * any further work. Returns `true` only when the stamp matches and the
 * binary exists; callers should still `await ensurePythonReady()` to be
 * fully sure.
 */
export function isPythonStampedReady(): boolean {
  const effectivePython = getEffectivePythonPath()
  if (!existsSync(effectivePython)) return false
  const currentDigest = hashFile(getRequirementsPath())
  if (!currentDigest) return false
  return readStamp() === currentDigest
}

/**
 * Get the path to the venv Python binary managed by auto-setup.
 * Returns null if the venv doesn't exist yet.
 */
export function getAutoSetupPythonPath(): string | null {
  const effectivePython = getEffectivePythonPath()
  return existsSync(effectivePython) ? effectivePython : null
}
