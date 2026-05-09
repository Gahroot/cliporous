// ---------------------------------------------------------------------------
// usePythonSetup — bridges main-process python:setupProgress / python:setupDone
// events into the Zustand store, and exposes a manual `retry()` callback for
// the failure UI on DropScreen.
//
// Mount once in App.tsx. The main process auto-runs `ensurePythonReady()` on
// `did-finish-load`, so the renderer's only job here is to listen for events
// and reflect them into store state.
// ---------------------------------------------------------------------------

import { useCallback, useEffect } from 'react'

import { useStore } from '@/store'

export interface UsePythonSetup {
  /** Manually re-trigger the install flow (used by the "Retry" button). */
  retry: () => Promise<void>
}

export function usePythonSetup(): UsePythonSetup {
  const setPythonStatus = useStore((s) => s.setPythonStatus)
  const setPythonSetupError = useStore((s) => s.setPythonSetupError)
  const setPythonSetupProgress = useStore((s) => s.setPythonSetupProgress)

  // Wire IPC listeners exactly once — both events come from the main process,
  // emitted both by the startup auto-run and by IPC handlers that lazy-trigger
  // setup (e.g. YouTube download on a fresh install).
  useEffect(() => {
    const offProgress = window.api.onPythonSetupProgress((data) => {
      setPythonStatus('installing')
      setPythonSetupError(null)
      setPythonSetupProgress({
        stage: data.stage,
        message: data.message,
        percent: data.percent,
        package: data.package,
        currentPackage: data.currentPackage,
        totalPackages: data.totalPackages,
      })
    })

    const offDone = window.api.onPythonSetupDone((data) => {
      setPythonSetupProgress(null)
      if (data.success) {
        setPythonStatus('ready')
        setPythonSetupError(null)
      } else {
        setPythonStatus('error')
        setPythonSetupError(data.error ?? 'Python setup failed')
      }
    })

    // Seed initial status from a one-shot status check. If the env is already
    // ready (warm path), we'll never receive a setupProgress / setupDone, so
    // we mark it ready immediately to skip the install card entirely.
    let cancelled = false
    void window.api.getPythonStatus().then((status) => {
      if (cancelled) return
      if (status.ready) {
        setPythonStatus('ready')
        setPythonSetupError(null)
      }
      // If not ready, stay in 'checking' — the bootstrap auto-run will
      // immediately emit progress events (or a setupDone with success=true
      // on the fast path) and flip status accordingly.
    }).catch(() => {
      // Non-fatal — the install card / auto-run will recover us.
    })

    return () => {
      cancelled = true
      offProgress()
      offDone()
    }
  }, [setPythonStatus, setPythonSetupError, setPythonSetupProgress])

  const retry = useCallback(async (): Promise<void> => {
    setPythonStatus('installing')
    setPythonSetupError(null)
    setPythonSetupProgress({
      stage: 'downloading-python',
      message: 'Restarting setup…',
      percent: 0,
    })
    await window.api.startPythonSetup()
  }, [setPythonStatus, setPythonSetupError, setPythonSetupProgress])

  return { retry }
}
