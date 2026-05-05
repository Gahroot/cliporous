import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FolderOpen, Save, Settings, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RecoveryDialog } from '@/components/RecoveryDialog'
import { DropScreen } from '@/components/screens/DropScreen'
import { ProcessingScreen } from '@/components/screens/ProcessingScreen'
import { ClipGrid } from '@/components/screens/ClipGrid'
import { RenderScreen } from '@/components/screens/RenderScreen'

import { useStore } from '@/store'
import { saveProject, loadProject } from '@/services'
import type { PipelineStage } from '@/store/types'

// ---------------------------------------------------------------------------
// pipeline.stage → screen mapping (matches .ezcoder/plans/ux.md §6)
// ---------------------------------------------------------------------------

type ScreenName = 'drop' | 'processing' | 'clips' | 'render'

const PROCESSING_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'downloading',
  'transcribing',
  'scoring',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
])

function selectScreen(stage: PipelineStage, hasActiveSource: boolean): ScreenName {
  if (PROCESSING_STAGES.has(stage)) return 'processing'
  if (stage === 'ready') return hasActiveSource ? 'clips' : 'drop'
  if (stage === 'rendering' || stage === 'done') return 'render'
  // 'idle' and 'error' fall through to drop unless we already have a source
  if (stage === 'error' && hasActiveSource) return 'processing'
  return 'drop'
}

// ---------------------------------------------------------------------------
// Header — wordmark + actions
// ---------------------------------------------------------------------------

function AiUsageIndicator(): React.JSX.Element {
  const totalPromptTokens = useStore((s) => s.aiUsage.totalPromptTokens)
  const totalCompletionTokens = useStore((s) => s.aiUsage.totalCompletionTokens)
  const total = totalPromptTokens + totalCompletionTokens
  const display = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`
  return (
    <div
      className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums"
      title={`AI tokens this session — ${total.toLocaleString()} total (${totalPromptTokens.toLocaleString()} in / ${totalCompletionTokens.toLocaleString()} out)`}
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>{display}</span>
    </div>
  )
}

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
// Screen transition — single shared wrapper (fade + 8px y, 150ms)
// ---------------------------------------------------------------------------

function ScreenFrame({
  screen,
  children,
}: {
  screen: ScreenName
  children: React.ReactNode
}): React.JSX.Element {
  const reduceMotion = useReducedMotion()
  const yOffset = reduceMotion ? 0 : 8
  return (
    <motion.div
      key={screen}
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -yOffset }}
      transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
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
            <ScreenFrame key={screen} screen={screen}>
              {screen === 'drop' && <DropScreen />}
              {screen === 'processing' && <ProcessingScreen />}
              {screen === 'clips' && <ClipGrid />}
              {screen === 'render' && <RenderScreen />}
            </ScreenFrame>
          </AnimatePresence>
        </main>
      </div>
      <Toaster />
      <RecoveryDialog />
    </ErrorBoundary>
  )
}
