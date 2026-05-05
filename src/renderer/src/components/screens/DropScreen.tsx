/**
 * DropScreen — initial entry. Drop zone + URL/path input + recent projects.
 *
 * Single combined entry surface (matches `.ezcoder/plans/ux.md §1`):
 *   • Full-bleed centered shadcn <Card> with a dashed border = the drop zone.
 *   • One <Input> that auto-detects URL (starts with `http(s)://`) vs file path
 *     and dispatches to the right pipeline starter on Enter.
 *   • Native HTML5 drag-and-drop on the Card — no react-dnd, no extra deps.
 *   • Recent-projects list below (max 5), each a clickable shadcn <Card> row.
 *   • Ghost "Import .batchclip…" button as a secondary entry point.
 *
 * Pipeline kick-off: build a `SourceVideo`, `addSource()` + `setActiveSource()`,
 * then `usePipeline().processVideo()`. The router in App.tsx swaps to
 * ProcessingScreen as soon as `pipeline.stage` leaves `idle`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileVideo, FolderOpen, Link as LinkIcon, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { useStore } from '@/store'
import { loadProject, loadProjectFromPath } from '@/services'
import { usePipeline } from '@/hooks'
import type { SourceVideo } from '@/store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mts', 'm4v'] as const
const MAX_RECENTS = 5

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function isVideoFilename(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext ? (VIDEO_EXTENSIONS as readonly string[]).includes(ext) : false
}

function basename(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '')
  const last = cleaned.split(/[/\\]/).pop()
  return last && last.length > 0 ? last : cleaned
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const sec = Math.max(1, Math.floor(diff / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

// Crypto-safe id without pulling a uuid dep.
function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface RecentProjectEntry {
  path: string
  name: string
  lastOpened: number
  clipCount: number
  sourceCount: number
}

// ---------------------------------------------------------------------------
// DropScreen
// ---------------------------------------------------------------------------

export function DropScreen(): React.JSX.Element {
  const addSource = useStore((s) => s.addSource)
  const setActiveSource = useStore((s) => s.setActiveSource)
  const addError = useStore((s) => s.addError)
  const { processVideo } = usePipeline()

  const [value, setValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [recents, setRecents] = useState<RecentProjectEntry[]>([])
  const dragDepth = useRef(0)

  // Detect input mode from the current value (URL vs file path vs neutral).
  const inputMode: 'url' | 'file' | 'neutral' = useMemo(() => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return 'neutral'
    if (isUrl(trimmed)) return 'url'
    if (
      trimmed.startsWith('/') ||
      trimmed.startsWith('~') ||
      trimmed.startsWith('file://') ||
      /^[a-zA-Z]:[\\/]/.test(trimmed) ||
      isVideoFilename(trimmed)
    ) {
      return 'file'
    }
    return 'neutral'
  }, [value])

  const LeadingIcon = inputMode === 'url' ? LinkIcon : inputMode === 'file' ? FileVideo : Upload

  // ── Recent projects ────────────────────────────────────────────────────
  const refreshRecents = useCallback(async (): Promise<void> => {
    try {
      const all = await window.api.getRecentProjects()
      setRecents(all.slice(0, MAX_RECENTS))
    } catch (err) {
      // Non-fatal — surface to log only, don't toast.
      const message = err instanceof Error ? err.message : String(err)
      addError({ source: 'project', message: `Failed to load recent projects: ${message}` })
    }
  }, [addError])

  useEffect(() => {
    void refreshRecents()
  }, [refreshRecents])

  // ── Pipeline starters ──────────────────────────────────────────────────
  const startFromFilePath = useCallback(
    async (filePath: string): Promise<void> => {
      if (isStarting) return
      setIsStarting(true)
      try {
        const meta = await window.api.getMetadata(filePath)
        const source: SourceVideo = {
          id: makeId(),
          path: filePath,
          name: basename(filePath),
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          origin: 'file',
        }
        addSource(source)
        setActiveSource(source.id)
        // Don't await — processVideo runs the full pipeline; the router will
        // switch to ProcessingScreen as soon as stage leaves 'idle'.
        void processVideo(source)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error(`Couldn't read video: ${message}`)
        addError({ source: 'pipeline', message: `Failed to ingest ${filePath}: ${message}` })
        setIsStarting(false)
      }
    },
    [addError, addSource, isStarting, processVideo, setActiveSource]
  )

  const startFromUrl = useCallback(
    (url: string): void => {
      if (isStarting) return
      setIsStarting(true)
      const source: SourceVideo = {
        id: makeId(),
        path: '',
        name: url,
        duration: 0,
        width: 0,
        height: 0,
        origin: 'youtube',
        youtubeUrl: url,
      }
      addSource(source)
      setActiveSource(source.id)
      void processVideo(source)
    },
    [addSource, isStarting, processVideo, setActiveSource]
  )

  // ── Submit (Enter / blur) ──────────────────────────────────────────────
  const handleSubmit = useCallback((): void => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (isUrl(trimmed)) {
      startFromUrl(trimmed)
    } else {
      // Treat as a local path. ffprobe will fail loudly if it isn't a video.
      void startFromFilePath(trimmed)
    }
  }, [startFromFilePath, startFromUrl, value])

  // ── Native HTML5 drag-and-drop ─────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    dragDepth.current += 1
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    // preventDefault is required to allow a drop event to fire.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault()
      dragDepth.current = 0
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files ?? [])
      if (files.length === 0) return
      const file = files[0]

      // .batchclip → load as project. Anything else → treat as video.
      if (file.name.toLowerCase().endsWith('.batchclip')) {
        const path = window.api.getPathForFile(file)
        void loadProjectFromPath(path).then((ok) => {
          if (ok) {
            toast.success('Project loaded')
            void refreshRecents()
          }
        })
        return
      }

      if (!isVideoFilename(file.name)) {
        toast.error(`Unsupported file type: ${file.name}`)
        return
      }

      const path = window.api.getPathForFile(file)
      if (!path) {
        toast.error("Couldn't resolve file path")
        return
      }
      void startFromFilePath(path)
    },
    [refreshRecents, startFromFilePath]
  )

  // ── Click-to-browse via system dialog ──────────────────────────────────
  const handleBrowse = useCallback(async (): Promise<void> => {
    try {
      const paths = await window.api.openFiles()
      if (paths.length > 0) void startFromFilePath(paths[0])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't open file: ${message}`)
    }
  }, [startFromFilePath])

  // ── Recent projects ────────────────────────────────────────────────────
  const handleOpenRecent = useCallback(
    async (entry: RecentProjectEntry): Promise<void> => {
      const ok = await loadProjectFromPath(entry.path)
      if (ok) toast.success(`Loaded ${entry.name}`)
      else toast.error(`Couldn't open ${entry.name}`)
    },
    []
  )

  const handleImportProject = useCallback(async (): Promise<void> => {
    const ok = await loadProject()
    if (ok) {
      toast.success('Project loaded')
      void refreshRecents()
    }
  }, [refreshRecents])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {/* Drop zone — single shadcn Card with dashed border */}
        <Card
          role="button"
          tabIndex={0}
          aria-label="Drop a video file or paste a URL"
          aria-disabled={isStarting}
          onClick={handleBrowse}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              void handleBrowse()
            }
          }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-6 border-2 border-dashed bg-transparent p-12 shadow-none transition-all duration-150',
            'hover:border-foreground/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isDragOver && 'border-primary bg-primary/5 scale-[1.01]',
            isStarting && 'pointer-events-none opacity-60'
          )}
          style={{ minHeight: '60vh' }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Upload
              className={cn(
                'h-12 w-12 transition-colors',
                isDragOver ? 'text-primary' : 'text-muted-foreground'
              )}
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="space-y-1">
              <h2 className="text-foreground text-lg font-semibold tracking-tight">
                Drop a video file or paste a URL
              </h2>
              <p className="text-muted-foreground text-sm">
                MP4, MOV, MKV, WEBM — or a YouTube / TikTok / X link
              </p>
            </div>
          </div>

          {/* Combined Input — URL or path. Stop click bubbling so it doesn't open the picker. */}
          <div
            className="relative w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <LeadingIcon
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="Paste a URL or file path…"
              spellCheck={false}
              autoComplete="off"
              disabled={isStarting}
              className="pl-9"
              aria-label="Video URL or file path"
            />
          </div>
        </Card>

        {/* Recent projects */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground text-sm font-semibold tracking-tight">
              Recent projects
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleImportProject}
              className="text-muted-foreground"
            >
              <FolderOpen />
              Import .batchclip…
            </Button>
          </div>

          {recents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Recent projects appear here.
            </p>
          ) : (
            <ScrollArea className="max-h-[280px]">
              <ul className="flex flex-col gap-2">
                {recents.map((entry) => (
                  <li key={entry.path}>
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => void handleOpenRecent(entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void handleOpenRecent(entry)
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                      )}
                    >
                      <FileVideo
                        className="text-muted-foreground h-4 w-4 shrink-0"
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-foreground truncate text-sm font-medium">
                          {entry.name}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {entry.clipCount} clip{entry.clipCount === 1 ? '' : 's'}
                          {' · '}
                          {entry.path}
                        </span>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatRelativeTime(entry.lastOpened)}
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </section>
      </div>
    </div>
  )
}
