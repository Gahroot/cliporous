/**
 * IPC Error Handling Contract
 * ───────────────────────────
 * All IPC handlers follow this pattern:
 *
 * 1. Main process: Handlers are wrapped with `wrapHandler()` which logs errors
 *    to the main process console/log, then re-throws so `ipcMain.handle`
 *    serialises them as rejected promises to the renderer.
 *
 * 2. Renderer: Callers catch the rejected promise and report via
 *    `addError({ source, message })` in the Zustand store, which surfaces
 *    the error in the ErrorLog panel.
 *
 * 3. Silent swallowing is avoided — every error is logged on at least one side.
 *
 * This ensures consistent observability: the main process always logs IPC
 * failures, and the renderer always shows them to the user.
 */

import { log } from './logger'

/**
 * Wrap an IPC handler so that any thrown error is logged on the main process
 * side before being re-thrown (and thus serialised back to the renderer).
 */
export function wrapHandler<T>(
  channel: string,
  handler: (...args: any[]) => Promise<T> | T
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<T> => {
    try {
      return await handler(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'IPC', `[${channel}] ${message}`)
      throw err // re-throw so renderer gets the error
    }
  }
}
