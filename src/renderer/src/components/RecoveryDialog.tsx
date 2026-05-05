import { useEffect, useState } from 'react'
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
import { useStore } from '@/store'
import { clearRecovery, loadRecovery } from '@/services'
import { toast } from 'sonner'

/**
 * Recovery prompt — on launch, checks for an auto-saved project the user
 * hasn't acknowledged yet. If one is found, asks whether to restore it.
 *
 * Mounted once at the App root; renders nothing when there's no recovery
 * data or the user has already responded this session.
 */
export function RecoveryDialog(): React.JSX.Element | null {
  const acknowledgedRecovery = useStore((s) => s.acknowledgedRecovery)
  const acknowledgeRecovery = useStore((s) => s.acknowledgeRecovery)
  const [recoveryData, setRecoveryData] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (acknowledgedRecovery) return
    loadRecovery().then((data) => {
      if (cancelled) return
      if (data) {
        setRecoveryData(data)
        setOpen(true)
      } else {
        acknowledgeRecovery()
      }
    })
    return () => {
      cancelled = true
    }
  }, [acknowledgedRecovery, acknowledgeRecovery])

  const handleRestore = async (): Promise<void> => {
    if (!recoveryData) return
    try {
      const project = JSON.parse(recoveryData)
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
      acknowledgeRecovery()
      setOpen(false)
    }
  }

  const handleDiscard = async (): Promise<void> => {
    await clearRecovery()
    acknowledgeRecovery()
    setOpen(false)
  }

  if (!recoveryData) return null

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore previous session?</AlertDialogTitle>
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
