import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FolderOpen, Save, Settings, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'

import { AiUsageIndicator } from '@/components/AiUsageIndicator'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorLog } from '@/components/ErrorLog'
import { DropScreen } from '@/components/screens/DropScreen'
import { ProcessingScreen } from '@/components/screens/ProcessingScreen'
import { ClipGrid } from '@/components/screens/ClipGrid'
import { RenderScreen } from '@/components/screens/RenderScreen'

import { useAutosave, usePythonSetup } from '@/hooks'
import { useStore } from '@/store'
import { selectScreen } from '@/store/selectors'
import { saveProject, loadProject, loadRecovery, clearRecovery } from '@/services'

// ---------------------------------------------------------------------------
// Autosave toast — small bottom-right card that fades in when useAutosave
// reports a fresh save (justSaved=true for ~2s).
// ---------------------------------------------------------------------------

function AutosaveToast(): React.JSX.Element {
  const { justSaved } = useAutosave()
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence>
      {justSaved && (
        <motion.div
          key="autosave-toast"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="pointer-events-none fixed right-4 bottom-4 z-50"
        >
          <Card className="flex items-center gap-2 px-3 py-1.5 text-xs shadow-md">
            <span
              className="h-2 w-2 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            <span className="text-muted-foreground">Autosaved</span>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Header — wordmark + actions
// ---------------------------------------------------------------------------

function Header(): React.JSX.Element {
  const isDirty = useStore((s) => s.isDirty)

  const handleSave = async (): Promise<void> => {
    const result = await saveProject()
    if (result) toast.success('Project saved')
  }

  const handleOpen = async (): Promise<void> => {
    const ok = await loadProject()
    if (ok) toast.success('Project loaded')
  }

  const handleSettings = async (): Promise<void> => {
    try {
      await window.api.openSettingsWindow()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't open settings: ${msg}`)
    }
  }

  return (
    <header className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <span className="text-foreground text-sm font-semibold tracking-tight">
          BatchClip
        </span>
        {isDirty && (
          <span
            className="bg-muted-foreground/60 h-1.5 w-1.5 rounded-full"
            aria-label="Unsaved changes"
          />
        )}
      </div>

      <div className="flex items-center gap-1">
        <AiUsageIndicator />
        <Separator orientation="vertical" className="mx-2 h-5" />
        <Button variant="ghost" size="sm" onClick={handleSave}>
          <Save />
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={handleOpen}>
          <FolderOpen />
          Open
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSettings}>
          <Settings />
          Settings
        </Button>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Screen transition — the ENTIRE animation budget for the app.
// Single shared wrapper: fade + 8px y-shift, 150ms, easeOut.
// Keyed by pipeline.stage so transitions fire on stage change.
// No stagger, no parallax, no springs, no other framer-motion usage.
// ---------------------------------------------------------------------------

function ScreenFrame({
  motionKey,
  children,
}: {
  motionKey: string
  children: React.ReactNode
}): React.JSX.Element {
  const reduceMotion = useReducedMotion()
  const yOffset = reduceMotion ? 0 : 8
  return (
    <motion.div
      key={motionKey}
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -yOffset }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="flex h-full w-full flex-col"
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Recovery prompt — on first paint, check for an auto-saved payload from a
// previous session that wasn't shut down cleanly. Deferred 400ms (V1
// behavior) so the initial screen render isn't blocked by the modal.
// Only shown when the payload contains at least one clip.
// ---------------------------------------------------------------------------

function RecoveryPrompt(): React.JSX.Element | null {
  const acknowledgedRecovery = useStore((s) => s.acknowledgedRecovery)
  const acknowledgeRecovery = useStore((s) => s.acknowledgeRecovery)
  const [payload, setPayload] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (acknowledgedRecovery) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const data = await loadRecovery()
      if (cancelled) return
      if (!data) {
        acknowledgeRecovery()
        return
      }
      try {
        const project = JSON.parse(data) as { clips?: Record<string, unknown[]> }
        const clips = project.clips ?? {}
        const hasClips = Object.values(clips).some(
          (arr) => Array.isArray(arr) && arr.length > 0
        )
        if (!hasClips) {
          await clearRecovery()
          acknowledgeRecovery()
          return
        }
        setPayload(data)
        setOpen(true)
      } catch {
        await clearRecovery()
        acknowledgeRecovery()
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [acknowledgedRecovery, acknowledgeRecovery])

  const handleRestore = async (): Promise<void> => {
    if (!payload) return
    try {
      const project = JSON.parse(payload)
      const sources = project.sources ?? []
      const clips = project.clips ?? {}
      const hasClips = Object.values(clips).some(
        (arr) => Array.isArray(arr) && arr.length > 0
      )
      const activeSourceId = hasClips && sources.length > 0 ? sources[0].id : null
      useStore.setState({
        sources,
        transcriptions: project.transcriptions ?? {},
        clips,
        activeSourceId,
        pipeline: hasClips
          ? { stage: 'ready', message: '', percent: 100 }
          : { stage: 'idle', message: '', percent: 0 },
        isDirty: false,
      })
      toast.success('Recovered your last session')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Recovery failed: ${msg}`)
    } finally {
      await clearRecovery()
      acknowledgeRecovery()
      setOpen(false)
    }
  }

  const handleDiscard = async (): Promise<void> => {
    await clearRecovery()
    acknowledgeRecovery()
    setOpen(false)
  }

  if (!payload) return null

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-amber-500" aria-hidden="true" />
            Recover unsaved work
          </AlertDialogTitle>
          <AlertDialogDescription>
            BatchClip didn&apos;t shut down cleanly last time. We saved your
            project — restore it now, or discard and start fresh.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDiscard}>Discard</AlertDialogCancel>
          <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const stage = useStore((s) => s.pipeline.stage)
  const activeSourceId = useStore((s) => s.activeSourceId)
  const hydrateSecretsFromMain = useStore((s) => s.hydrateSecretsFromMain)

  // Wire python:setupProgress / python:setupDone listeners into the store so
  // DropScreen can render the first-run install card. Mounted once at the App
  // root — the hook is idempotent.
  usePythonSetup()

  // Hydrate API keys from the main-process safeStorage on first paint.
  // The Settings window writes via window.api.secrets.set(...) and the main
  // window's Zustand state is empty until this runs. Without this the
  // pipeline's scoring step fails with "API key required".
  useEffect(() => {
    void hydrateSecretsFromMain()
  }, [hydrateSecretsFromMain])

  const screen = useMemo(
    () => selectScreen(stage, activeSourceId !== null),
    [stage, activeSourceId]
  )

  return (
    <ErrorBoundary>
      <div className="bg-background text-foreground flex h-screen w-full flex-col">
        <Header />
        <main className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <ScreenFrame key={stage} motionKey={stage}>
              {screen === 'drop' && <DropScreen />}
              {screen === 'processing' && <ProcessingScreen />}
              {screen === 'clips' && <ClipGrid />}
              {screen === 'render' && <RenderScreen />}
            </ScreenFrame>
          </AnimatePresence>
        </main>
        <ErrorLog />
      </div>
      <AutosaveToast />
      <Toaster />
      <RecoveryPrompt />
    </ErrorBoundary>
  )
}
