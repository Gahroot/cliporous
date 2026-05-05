/**
 * Cross-window settings sync via BroadcastChannel.
 *
 * When a settings change is persisted to localStorage in one window,
 * `broadcastSettingsChange()` notifies the other window(s) to reload.
 */

const channel = new BroadcastChannel('batchclip-settings-sync')

export function broadcastSettingsChange(): void {
  channel.postMessage({ type: 'settings-changed', timestamp: Date.now() })
}

export function listenForSettingsChanges(callback: () => void): () => void {
  const handler = (event: MessageEvent): void => {
    if (event.data?.type === 'settings-changed') {
      callback()
    }
  }
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}
