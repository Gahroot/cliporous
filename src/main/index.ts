/**
 * Main process entry point — thin bootstrap.
 *
 * Responsibilities:
 *   • Initialise the file logger as soon as the app is ready.
 *   • Configure FFmpeg paths.
 *   • Probe Python availability (non-blocking; status is recorded but never
 *     gates window creation).
 *   • Register every IPC handler module under `./ipc/`.
 *   • Create the main BrowserWindow with a dark background that matches the
 *     renderer (#23100c) so launch never flashes white.
 *   • Wire process-level crash handlers — `uncaughtException` shows a native
 *     dialog with a copy-to-clipboard option then exits;
 *     `unhandledRejection` is logged to the console only.
 *
 * No business logic lives here.
 */

import { app, BrowserWindow, dialog, clipboard, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'

import { initLogger, log, closeLogger } from './logger'
import { setupFFmpeg } from './ffmpeg'
import { isPythonAvailable } from './python'

import {
  registerAiHandlers,
  registerExportHandlers,
  registerFfmpegHandlers,
  registerMediaHandlers,
  registerProjectHandlers,
  registerRenderHandlers,
  registerSecretsHandlers,
  registerSystemHandlers
} from './ipc'
import { registerSettingsWindowHandlers } from './settings-window'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Renderer body background — matched here to prevent white flash on launch. */
const WINDOW_BACKGROUND = '#23100c'

const MIN_WIDTH = 1280
const MIN_HEIGHT = 800

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null

/** Result of the Python availability probe; consumed by IPC handlers. */
let pythonReady = false
export function isPythonReady(): boolean {
  return pythonReady
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: MIN_WIDTH,
    height: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Open external links in the default browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => { /* ignore */ })
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ---------------------------------------------------------------------------
// Crash handlers
// ---------------------------------------------------------------------------

function showFatalDialog(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack : message

  const detail = `${message}\n\n${stack}`

  // dialog.showMessageBoxSync is safe to call before/after windows exist.
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'BatchContent — Fatal Error',
    message: 'An unrecoverable error occurred and the application will exit.',
    detail,
    buttons: ['Copy details', 'Quit'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })

  if (choice === 0) {
    clipboard.writeText(detail)
  }
}

function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    try {
      log('error', 'main', 'uncaughtException', { message: String(err), stack: (err as Error)?.stack })
      console.error('[main] uncaughtException:', err)
      showFatalDialog(err)
    } finally {
      closeLogger()
      app.exit(1)
    }
  })

  process.on('unhandledRejection', (reason) => {
    // Console-only by design — do not crash, do not surface a dialog.
    console.error('[main] unhandledRejection:', reason)
  })
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

installCrashHandlers()

// Single-instance lock — focus existing window if a second instance launches.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    initLogger()
    log('info', 'main', 'app ready')

    electronApp.setAppUserModelId('com.batchcontent.app')

    setupFFmpeg()

    // Non-blocking Python probe — record status, never gate startup.
    isPythonAvailable()
      .then((ok) => {
        pythonReady = ok
        log('info', 'main', `python available: ${ok}`)
      })
      .catch((err) => {
        pythonReady = false
        log('warn', 'main', 'python probe failed', { message: String(err) })
      })

    // Register every IPC handler module.
    registerAiHandlers()
    registerExportHandlers()
    registerFfmpegHandlers()
    registerMediaHandlers()
    registerProjectHandlers()
    registerRenderHandlers()
    registerSecretsHandlers()
    registerSystemHandlers()

    mainWindow = createMainWindow()
    registerSettingsWindowHandlers(mainWindow)

    // Dev-only: F12 toggles DevTools, Ctrl/Cmd+R is suppressed in production.
    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
        registerSettingsWindowHandlers(mainWindow)
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      closeLogger()
      app.quit()
    }
  })

  app.on('before-quit', () => {
    closeLogger()
  })
}
