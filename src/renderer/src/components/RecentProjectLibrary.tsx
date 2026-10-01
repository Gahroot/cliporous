import type { RecentProjectEntry } from '@shared/recent-projects';
import {
  AlertTriangle,
  Copy,
  Eye,
  FileVideo,
  FolderOpen,
  LayoutGrid,
  List,
  ListX,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProjectListSkeleton } from '@/components/CreatorSkeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { revealItemLabel } from '@/lib/platform';
import { cn } from '@/lib/utils';

interface RecentProjectLibraryProps {
  projects: RecentProjectEntry[];
  loading: boolean;
  error: string | null;
  busyPath: string | null;
  onRetry: () => void;
  onOpen: (project: RecentProjectEntry) => void;
  onNewProject: () => void;
  onOpenProjectFile: () => void;
  onReveal: (project: RecentProjectEntry) => void;
  onPin: (project: RecentProjectEntry) => void;
  onRename: (project: RecentProjectEntry, name: string) => void;
  onDuplicate: (project: RecentProjectEntry) => void;
  onRemove: (project: RecentProjectEntry) => void;
  onDelete: (project: RecentProjectEntry) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

const STAGE_LABELS: Record<string, string> = {
  idle: 'Source',
  downloading: 'Importing',
  transcribing: 'Transcribing',
  scoring: 'Finding moments',
  'detecting-faces': 'Framing faces',
  thumbnails: 'Building selects',
  ready: 'Review',
  rendering: 'Exporting',
  done: 'Exported',
  error: 'Needs attention',
  'ai-editing': 'Building edit',
};

function stageLabel(stage: string | undefined): string {
  if (!stage) return 'Source';
  return STAGE_LABELS[stage] ?? stage.replace(/-/g, ' ');
}

function nextAction(project: RecentProjectEntry): string {
  if (project.missingMedia) return 'Open to relink media';
  if (project.stage === 'error') return 'Open to recover';
  if (project.stage === 'ready') return 'Resume review';
  if (project.stage === 'done') return 'Review exports';
  return 'Open saved progress';
}

function ProjectPoster({ project }: { project: RecentProjectEntry }): React.JSX.Element {
  const poster = project.poster || project.selectedFrames?.[0];
  if (poster) {
    return (
      <img
        src={poster}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
        loading="lazy"
      />
    );
  }
  return (
    <div className="bg-muted relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,hsl(var(--secondary)),hsl(var(--muted))_48%,hsl(var(--border))_49%,hsl(var(--secondary)))] opacity-70" />
      <FileVideo className="text-muted-foreground relative h-5 w-5" strokeWidth={1.5} aria-hidden />
    </div>
  );
}

export function RecentProjectLibrary({
  projects,
  loading,
  error,
  busyPath,
  onRetry,
  onOpen,
  onNewProject,
  onOpenProjectFile,
  onReveal,
  onPin,
  onRename,
  onDuplicate,
  onRemove,
  onDelete,
}: RecentProjectLibraryProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'pinned'>('recent');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [kind, setKind] = useState<'all' | 'short' | 'longform'>('all');
  const [status, setStatus] = useState('all');
  const [renameProject, setRenameProject] = useState<RecentProjectEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteProject, setDeleteProject] = useState<RecentProjectEntry | null>(null);

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = projects.filter((project) => {
      if (kind !== 'all' && (project.kind ?? 'short') !== kind) return false;
      if (status === 'missing-media') {
        if (!project.missingMedia) return false;
      } else if (status !== 'all' && (project.stage || 'idle') !== status) {
        return false;
      }
      return [project.name, project.sourceName ?? '', project.path].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
    return matches.sort((left, right) => {
      if (sort === 'pinned' && Boolean(left.pinned) !== Boolean(right.pinned)) {
        return left.pinned ? -1 : 1;
      }
      return (
        right.lastOpened - left.lastOpened ||
        (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      );
    });
  }, [projects, query, sort, kind, status]);

  const clearFilters = (): void => {
    setQuery('');
    setKind('all');
    setStatus('all');
  };

  const openRename = (project: RecentProjectEntry): void => {
    setRenameProject(project);
    setRenameValue(project.name);
  };

  return (
    <section className="space-y-3" aria-labelledby="recent-projects-title">
      <div className="flex flex-col gap-3">
        <div>
          <h2 id="recent-projects-title" className="text-base font-semibold tracking-tight">
            Recent projects
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Open saved sources, selects and export progress. Interrupted work does not restart
            automatically.
          </p>
        </div>
        {!loading && !error && projects.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-full sm:basis-48 sm:flex-1">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects"
                aria-label="Search recent projects"
                className="pl-9"
              />
            </div>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as 'all' | 'short' | 'longform')}
            >
              <SelectTrigger
                className="w-auto min-w-32 flex-1 sm:flex-none"
                aria-label="Filter project kind"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="short">Short clips</SelectItem>
                <SelectItem value="longform">Long-form</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                className="w-auto min-w-36 flex-1 sm:flex-none"
                aria-label="Filter saved status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="missing-media">Media missing</SelectItem>
                {Object.entries(STAGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as 'recent' | 'pinned')}>
              <SelectTrigger className="w-32" aria-label="Sort projects">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="pinned">Pinned first</SelectItem>
              </SelectContent>
            </Select>
            <fieldset className="flex gap-1" aria-label="Project view">
              <Button
                type="button"
                size="sm"
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden /> Grid
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === 'list' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List className="h-4 w-4" aria-hidden /> List
              </Button>
            </fieldset>
            {(query.trim() || kind !== 'all' || status !== 'all') && (
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <ProjectListSkeleton />
      ) : error ? (
        <Card
          role="alert"
          className="border-destructive/40 bg-card flex flex-col items-start gap-3 p-5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Recent projects could not load</p>
              <p className="text-muted-foreground mt-1 text-sm">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="bg-card/70 flex flex-col items-center gap-3 border-dashed px-6 py-8 text-center">
          <FileVideo className="text-muted-foreground h-7 w-7" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="text-sm font-semibold">No saved projects yet</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">
              Start with a video, or open an existing BatchClip project from disk.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" disabled={busyPath !== null} onClick={onNewProject}>
              <Plus className="h-4 w-4" aria-hidden />
              New project
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyPath !== null}
              onClick={onOpenProjectFile}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              Open project
            </Button>
          </div>
        </Card>
      ) : visibleProjects.length === 0 ? (
        <Card className="bg-card/70 flex flex-col items-center gap-3 border-dashed px-6 py-8 text-center">
          <Search className="text-muted-foreground h-6 w-6" aria-hidden />
          <div role="status" aria-live="polite">
            <p className="text-sm font-semibold">
              {query.trim()
                ? `No projects match “${query.trim()}”`
                : 'No projects match these filters'}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Change the kind or saved status, or search by project name, source or path.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Show all projects
          </Button>
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status" aria-live="polite">
            {visibleProjects.length} project{visibleProjects.length === 1 ? '' : 's'} shown
          </p>
          <ul
            aria-label="Saved projects"
            className={
              view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-2'
            }
          >
            {visibleProjects.map((project) => {
              const busy = busyPath === project.path;
              return (
                <li key={project.path} className="min-w-0">
                  <Card
                    className={cn(
                      'bg-card/80 group flex min-w-0 overflow-hidden border-border/80 transition-[border-color,box-shadow] duration-150 hover:border-primary/45 hover:shadow-sm focus-within:border-primary/55',
                      view === 'grid' && 'h-full flex-col',
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex min-w-0 flex-1 items-stretch text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
                        view === 'grid' && 'flex-col',
                      )}
                      aria-busy={busy}
                      onClick={() => onOpen(project)}
                      disabled={busyPath !== null}
                    >
                      <span
                        className={cn(
                          'bg-muted relative shrink-0 overflow-hidden',
                          view === 'grid'
                            ? 'block aspect-video w-full'
                            : 'hidden h-28 w-40 sm:block',
                        )}
                      >
                        <ProjectPoster project={project} />
                        {project.pinned && (
                          <span className="bg-black/70 absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded text-white">
                            <Pin className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Pinned</span>
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4 py-3">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">{project.name}</span>
                          {project.missingMedia && (
                            <span className="indicator-warning shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                              Media missing
                            </span>
                          )}
                        </span>
                        <span
                          className="text-muted-foreground truncate text-xs"
                          title={project.sourceName ?? project.path}
                        >
                          {project.sourceName ?? project.path}
                        </span>
                        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                          <span>
                            {project.kind === 'longform' ? '16:9 long-form' : '9:16 shorts'}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{project.clipCount} clips</span>
                          <span aria-hidden>·</span>
                          <span>{project.selectedCount ?? 0} selects</span>
                          <span aria-hidden>·</span>
                          <span>Saved stage: {stageLabel(project.stage)}</span>
                        </span>
                        <span className="text-xs font-medium text-primary">
                          {busy ? 'Working…' : nextAction(project)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'text-muted-foreground shrink-0 text-xs tabular-nums',
                          view === 'grid'
                            ? 'px-4 pb-3'
                            : 'hidden items-center px-3 min-[760px]:flex',
                        )}
                      >
                        {formatRelativeTime(project.lastOpened)}
                      </span>
                    </button>

                    <div
                      className={cn(
                        'border-border/70 flex shrink-0 items-center px-1.5',
                        view === 'grid' ? 'justify-end border-t' : 'border-l',
                      )}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            aria-label={`Project actions for ${project.name}`}
                            disabled={busyPath !== null}
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            onSelect={() => onOpen(project)}
                          >
                            <FolderOpen /> {nextAction(project)}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            onSelect={() => onReveal(project)}
                          >
                            <Eye /> {revealItemLabel()}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            onSelect={() => onPin(project)}
                          >
                            {project.pinned ? <PinOff /> : <Pin />}
                            {project.pinned ? 'Unpin project' : 'Pin project'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            onSelect={() => openRename(project)}
                          >
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            onSelect={() => onDuplicate(project)}
                          >
                            <Copy /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            onSelect={() => onRemove(project)}
                          >
                            <ListX /> Remove from Recents
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyPath !== null}
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteProject(project)}
                          >
                            <Trash2 /> Delete project file
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog
        open={renameProject !== null}
        onOpenChange={(open) => !open && setRenameProject(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              This changes the project name and its .batchclip filename.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="rename-project-name">Project name</Label>
            <Input
              id="rename-project-name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  busyPath === null &&
                  renameProject &&
                  renameValue.trim()
                ) {
                  onRename(renameProject, renameValue.trim());
                  setRenameProject(null);
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setRenameProject(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim() || busyPath !== null}
              onClick={() => {
                if (!renameProject || busyPath !== null) return;
                onRename(renameProject, renameValue.trim());
                setRenameProject(null);
              }}
            >
              {busyPath === renameProject?.path ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteProject !== null}
        onOpenChange={(open) => !open && setDeleteProject(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteProject?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the .batchclip project file. Source videos and rendered
              exports stay on disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busyPath !== null}
              onClick={() => busyPath === null && deleteProject && onDelete(deleteProject)}
            >
              {busyPath === deleteProject?.path ? 'Deleting…' : 'Delete project file'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
