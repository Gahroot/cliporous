import { ipcMain } from 'electron'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'
import { getSecret, setSecret, hasSecret, clearSecret } from '../secrets'

/**
 * IPC handlers for encrypted secret storage. The renderer fetches API keys
 * through these channels on startup (see `hydrateSecretsFromMain` in
 * settings-slice) rather than reading them from plaintext `localStorage`.
 */
export function registerSecretsHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.SECRETS_GET,
    wrapHandler(Ch.Invoke.SECRETS_GET, (_event, name: string): string | null => {
      return getSecret(name)
    })
  )

  ipcMain.handle(
    Ch.Invoke.SECRETS_SET,
    wrapHandler(Ch.Invoke.SECRETS_SET, (_event, name: string, value: string): void => {
      setSecret(name, value)
    })
  )

  ipcMain.handle(
    Ch.Invoke.SECRETS_HAS,
    wrapHandler(Ch.Invoke.SECRETS_HAS, (_event, name: string): boolean => {
      return hasSecret(name)
    })
  )

  ipcMain.handle(
    Ch.Invoke.SECRETS_CLEAR,
    wrapHandler(Ch.Invoke.SECRETS_CLEAR, (_event, name: string): void => {
      clearSecret(name)
    })
  )
}
