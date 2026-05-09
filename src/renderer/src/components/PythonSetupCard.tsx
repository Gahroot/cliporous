/**
 * PythonSetupCard — first-run / repair install UI.
 *
 * Replaces the DropScreen drop zone while the Python environment is being
 * installed. Shown when `pythonStatus === 'installing' | 'error'`.
 *
 * Three visual states:
 *   • installing — progress bar + per-package label
 *   • error      — message + Retry / Copy details buttons
 *
 * Progress data is fed by `usePythonSetup` (mounted in App.tsx) which listens
 * to the main process's `python:setupProgress` / `python:setupDone` events.
 */

import { useCallback } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

import { usePythonSetup } from '@/hooks'
import { useStore } from '@/store'

export function PythonSetupCard(): React.JSX.Element {
  const status = useStore((s) => s.pythonStatus)
  const progress = useStore((s) => s.pythonSetupProgress)
  const error = useStore((s) => s.pythonSetupError)
  const { retry } = usePythonSetup()

  const handleRetry = useCallback(async (): Promise<void> => {
    try {
      await retry()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't restart setup: ${msg}`)
    }
  }, [retry])

  const handleCopy = useCallback((): void => {
    if (!error) return
    void navigator.clipboard.writeText(error).then(
      () => toast.success('Error copied to clipboard'),
      () => toast.error("Couldn't copy to clipboard")
    )
  }, [error])

  // Error state ----------------------------------------------------------
  if (status === 'error') {
    return (
      <Card
        className="flex flex-col items-center gap-6 border-2 border-dashed bg-transparent p-12 shadow-none"
        style={{ minHeight: '60vh' }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle
            className="h-12 w-12 text-destructive"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="space-y-1">
            <h2 className="text-foreground text-lg font-semibold tracking-tight">
              Setup failed
            </h2>
            <p className="text-muted-foreground max-w-md text-sm">
              The Python environment couldn&apos;t finish installing. This is
              usually a network or disk-space issue.
            </p>
          </div>
        </div>

        {error && (
          <pre className="bg-muted text-muted-foreground max-h-40 w-full max-w-md overflow-auto rounded-md border p-3 text-left text-xs whitespace-pre-wrap break-words">
            {error}
          </pre>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={handleRetry}>Retry setup</Button>
          {error && (
            <Button variant="ghost" onClick={handleCopy}>
              Copy details
            </Button>
          )}
        </div>
      </Card>
    )
  }

  // Installing / checking state -----------------------------------------
  const percent = progress?.percent ?? 0
  const message = progress?.message ?? 'Preparing first-run setup…'
  const packageLabel = progress?.package
  const showPackageCounter =
    progress?.currentPackage != null && progress.currentPackage > 0

  return (
    <Card
      className="flex flex-col items-center gap-6 border-2 border-dashed bg-transparent p-12 shadow-none"
      style={{ minHeight: '60vh' }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2
          className="text-primary h-12 w-12 animate-spin"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="space-y-1">
          <h2 className="text-foreground text-lg font-semibold tracking-tight">
            Setting up — first run only
          </h2>
          <p className="text-muted-foreground max-w-md text-sm">
            Installing the AI tools BatchClip needs to score, transcribe, and
            crop your videos. This only happens once.
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <Progress value={percent} className="h-2" />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground truncate">
            {packageLabel ? `${message}` : message}
          </span>
          <span className="text-muted-foreground tabular-nums shrink-0">
            {percent}%
            {showPackageCounter ? ` · pkg ${progress?.currentPackage}` : ''}
          </span>
        </div>
      </div>
    </Card>
  )
}
