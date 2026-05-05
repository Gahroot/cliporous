// Minimal electron stub for running main-process modules outside of Electron.
// Only the bits ffmpeg.ts / font-registry.ts / logger.ts touch are wired up.
const path = require('path')
const os = require('os')

const projectRoot = path.resolve(__dirname, '..', '..')

module.exports = {
  app: {
    isPackaged: false,
    getPath(name) {
      if (name === 'userData') return path.join(os.tmpdir(), 'batchclip-verify')
      if (name === 'logs') return path.join(os.tmpdir(), 'batchclip-verify-logs')
      if (name === 'temp') return os.tmpdir()
      return os.tmpdir()
    },
    getAppPath: () => projectRoot,
    on() {},
    whenReady: () => Promise.resolve()
  },
  BrowserWindow: class {},
  ipcMain: { on() {}, handle() {} },
  dialog: {},
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s, 'utf-8'),
    decryptString: (b) => b.toString('utf-8')
  },
  clipboard: { writeText() {}, readText: () => '' },
  shell: { openExternal() {} },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) }
}
