import { BrowserWindow, ipcMain, screen, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'

let settingsWindow: BrowserWindow | null = null

const BOUNDS_FILE = join(app.getPath('userData'), 'settings-window-bounds.json')

function loadBounds(): Electron.Rectangle | null {
  try {
    return JSON.parse(readFileSync(BOUNDS_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function saveBounds(bounds: Electron.Rectangle): void {
  try {
    writeFileSync(BOUNDS_FILE, JSON.stringify(bounds))
  } catch {
    /* ignore */
  }
}

export function registerSettingsWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('settings-window:open', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus()
      return
    }

    // Restore saved bounds or compute defaults
    const saved = loadBounds()
    let x: number, y: number, width: number, height: number

    if (saved) {
      // Validate that saved bounds are on a visible display
      const display = screen.getDisplayMatching(saved)
      const workArea = display.workArea
      const onScreen =
        saved.x >= workArea.x - 100 &&
        saved.y >= workArea.y - 100 &&
        saved.x < workArea.x + workArea.width - 50 &&
        saved.y < workArea.y + workArea.height - 50
      if (onScreen) {
        ;({ x, y, width, height } = saved)
      } else {
        // Saved position is off-screen, use defaults
        const mainBounds = mainWindow.getBounds()
        x = mainBounds.x + mainBounds.width + 10
        y = mainBounds.y
        width = 540
        height = 700
      }
    } else {
      const mainBounds = mainWindow.getBounds()
      x = mainBounds.x + mainBounds.width + 10
      y = mainBounds.y
      width = 540
      height = 700
    }

    settingsWindow = new BrowserWindow({
      width,
      height,
      minWidth: 420,
      minHeight: 500,
      x,
      y,
      parent: mainWindow,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: 'Settings — BatchContent',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true
      }
    })

    settingsWindow.on('ready-to-show', () => {
      settingsWindow?.show()
    })

    // Save bounds on close
    settingsWindow.on('close', () => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        saveBounds(settingsWindow.getBounds())
      }
    })

    settingsWindow.on('closed', () => {
      settingsWindow = null
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-window:closed')
      }
    })

    // Allow DevTools in settings window (development only)
    if (is.dev) {
      settingsWindow.webContents.on('before-input-event', (_event, input) => {
        if (
          input.key === 'F12' ||
          (input.control && input.shift && input.key.toLowerCase() === 'i')
        ) {
          settingsWindow?.webContents.toggleDevTools()
        }
      })
    }

    // Load same renderer bundle with #settings hash
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#settings`)
    } else {
      settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: 'settings'
      })
    }
  })

  ipcMain.handle('settings-window:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close()
    }
  })

  ipcMain.handle('settings-window:is-open', () => {
    return settingsWindow !== null && !settingsWindow.isDestroyed()
  })

  // Close settings window when main window closes
  mainWindow.on('closed', () => {
    closeSettingsWindow()
  })
}

export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
  }
}
