import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FolderOpen, Save, Settings } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'

import { AiUsageIndicator } from '@/components/AiUsageIndicator'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorLog } from '@/components/ErrorLog'
import { RecoveryDialog } from '@/components/RecoveryDialog'
import { DropScreen } from '@/components/screens/DropScreen'
import { ProcessingScreen } from '@/components/screens/ProcessingScreen'
import { ClipGrid } from '@/components/screens/ClipGrid'
import { RenderScreen } from '@/components/screens/RenderScreen'

import { useAutosave } from '@/hooks'
import { useStore } from '@/store'
import { selectScreen } from '@/store/selectors'
import { saveProject, loadProject } from '@/services'

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
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const stage = useStore((s) => s.pipeline.stage)
  const activeSourceId = useStore((s) => s.activeSourceId)

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
      <RecoveryDialog />
    </ErrorBoundary>
  )
}
