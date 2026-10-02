import { findLongformPalette } from '@shared/longform-palette';
import type { RecentProjectEntry } from '@shared/recent-projects';
import { DEFAULT_STORYBOARD_STYLE } from '@shared/storyboards';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  FilePlus2,
  FolderOpen,
  Import,
  Link as LinkIcon,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type EntrySource, isYouTubeUrl } from '@/components/entry-source';
import { LongformAppearancePicker } from '@/components/LongformAppearancePicker';
import { NewProjectDialog, type NewProjectDraft } from '@/components/NewProjectDialog';
import { ProcessingRecipe } from '@/components/ProcessingRecipe';
import { PythonSetupCard } from '@/components/PythonSetupCard';
import { RecentProjectLibrary } from '@/components/RecentProjectLibrary';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLongformPipeline, usePipeline } from '@/hooks';
import { resolveGeminiKey } from '@/lib/gemini-key';
import { cn } from '@/lib/utils';
import { createNewProject, loadProject, loadProjectFromPath } from '@/services';
import { getCreatorProfiles } from '@/services/creator-profiles';
import { isActiveProcessingStage } from '@/services/job-service';
import type { SourceVideo } from '@/store';
import { useStore } from '@/store';

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mts', 'm4v'] as const;

function isVideoFilename(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension ? (VIDEO_EXTENSIONS as readonly string[]).includes(extension) : false;
}

function basename(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '');
  const last = cleaned.split(/[/\\]/).pop();
  return last && last.length > 0 ? last : cleaned;
}

function filenameStem(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '');
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DropScreen(): React.JSX.Element {
  const addSource = useStore((state) => state.addSource);
  const setActiveSource = useStore((state) => state.setActiveSource);
  const addError = useStore((state) => state.addError);
  const pythonStatus = useStore((state) => state.pythonStatus);
  const outputMode = useStore((state) => state.settings.outputMode);
  const setOutputMode = useStore((state) => state.setOutputMode);
  const setProjectDisplayName = useStore((state) => state.setProjectDisplayName);
  const setCreativeBrief = useStore((state) => state.setCreativeBrief);
  const commitCreativeBrief = useStore((state) => state.commitCreativeBrief);
  const setCreatorProfile = useStore((state) => state.setCreatorProfile);
  const setProcessingConfig = useStore((state) => state.setProcessingConfig);
  const setTargetPlatform = useStore((state) => state.setTargetPlatform);
  const setTemplateLayout = useStore((state) => state.setTemplateLayout);
  const setLongformSkin = useStore((state) => state.setLongformSkin);
  const setLongformPaletteId = useStore((state) => state.setLongformPaletteId);
  const setLongformStoryboardStyle = useStore((state) => state.setLongformStoryboardStyle);
  const { processVideo } = usePipeline();
  const { processLongform } = useLongformPipeline();

  const showSetupCard =
    pythonStatus === 'not-setup' ||
    pythonStatus === 'repair-needed' ||
    pythonStatus === 'installing' ||
    pythonStatus === 'cancelling' ||
    pythonStatus === 'error';

  const [url, setUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(true);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  const [queuedSource, setQueuedSource] = useState<EntrySource | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [entryVersion, setEntryVersion] = useState(0);
  const [importVersion, setImportVersion] = useState(0);
  const starting = useRef(false);
  const dragDepth = useRef(0);

  const canStartEntry = useCallback((): boolean => {
    const state = useStore.getState();
    if (
      isActiveProcessingStage(state.pipeline.stage) ||
      state.isRendering ||
      state.singleRenderStatus === 'rendering' ||
      state.processingCancellation.status === 'cancelling' ||
      state.renderCancellation.status === 'cancelling'
    ) {
      setIngestError('Finish or cancel active work before importing or opening a project.');
      return false;
    }
    return true;
  }, []);

  const canReplaceProject = useCallback((): boolean => {
    if (!canStartEntry()) return false;
    const state = useStore.getState();
    return (
      !state.isDirty ||
      window.confirm(`Discard unsaved changes to ${state.currentProject.displayName}?`)
    );
  }, [canStartEntry]);

  const ensureScoringKey = useCallback(async (mode: 'short' | 'longform'): Promise<boolean> => {
    const state = useStore.getState();
    if (mode === 'short' && state.processingConfig.promoMode) {
      setKeyMissing(false);
      return true;
    }

    const resolvedCredential = await resolveGeminiKey(state.settings.geminiApiKey);
    if (resolvedCredential) {
      setKeyMissing(false);
      return true;
    }
    setKeyMissing(true);
    setIngestError(null);
    toast.error('Gemini API key required', {
      description: 'Add your key in Settings before processing a video.',
    });
    return false;
  }, []);

  const handleOpenSettings = useCallback(async (): Promise<void> => {
    try {
      await window.api.openSettingsWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const structured = addError({ source: 'settings', error, message });
      toast.error(structured.headline);
    }
  }, [addError]);

  const refreshRecents = useCallback(async (): Promise<void> => {
    setRecentsLoading(true);
    setRecentsError(null);
    try {
      setRecents(await window.api.getRecentProjects());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addError({ source: 'project', message: `Failed to load recent projects: ${message}` });
      setRecentsError(message || 'The recent-project index is unavailable.');
    } finally {
      setRecentsLoading(false);
    }
  }, [addError]);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  const queueImport = useCallback(
    (source: EntrySource): void => {
      if (starting.current || busyProjectPath || !canStartEntry()) return;
      setQueuedSource(source);
      setIngestError(null);
      setKeyMissing(false);
      setImportOpen(true);
    },
    [busyProjectPath, canStartEntry],
  );

  const handleUrlSubmit = useCallback((): void => {
    if (isStarting) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!isYouTubeUrl(trimmed)) {
      const message = 'Paste a valid YouTube URL.';
      toast.error(message);
      setIngestError(message);
      return;
    }
    setIngestError(null);
    queueImport({ kind: 'url', value: trimmed });
  }, [isStarting, queueImport, url]);

  const chooseVideoPath = useCallback(async (): Promise<string | null> => {
    try {
      const paths = await window.api.openFiles();
      return paths[0] ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const structured = addError({
        source: 'pipeline',
        error,
        message: `Open file dialog: ${message}`,
        failedStage: 'source-ingest',
      });
      toast.error(structured.headline);
      setIngestError(structured.whatHappened);
      return null;
    }
  }, [addError]);

  const handleBrowse = useCallback(async (): Promise<void> => {
    if (starting.current || busyProjectPath) return;
    const path = await chooseVideoPath();
    if (!path) return;
    queueImport({ kind: 'file', value: path });
  }, [busyProjectPath, chooseVideoPath, queueImport]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragOver(false);
      if (starting.current || busyProjectPath) return;
      const file = Array.from(event.dataTransfer.files ?? [])[0];
      if (!file) return;
      const path = window.api.getPathForFile(file);

      if (!path) {
        setIngestError("Couldn't resolve the dropped file path.");
        return;
      }
      if (file.name.toLowerCase().endsWith('.batchclip')) {
        if (!canReplaceProject()) return;
        setBusyProjectPath(path);
        void loadProjectFromPath(path)
          .then((opened) => {
            if (opened) {
              toast.success('Project loaded');
              setQueuedSource(null);
              setEntryVersion((version) => version + 1);
              void refreshRecents();
            } else {
              setIngestError(`Couldn't open ${file.name}`);
            }
          })
          .finally(() => setBusyProjectPath(null));
        return;
      }
      if (!isVideoFilename(file.name)) {
        const message = `Unsupported file type: ${file.name}`;
        toast.error(message);
        setIngestError(message);
        return;
      }
      queueImport({ kind: 'file', value: path });
    },
    [busyProjectPath, canReplaceProject, refreshRecents, queueImport],
  );

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  }, []);

  const handleOpenRecent = useCallback(
    async (entry: RecentProjectEntry): Promise<void> => {
      if (starting.current || busyProjectPath || !canReplaceProject()) return;
      setBusyProjectPath(entry.path);
      try {
        const opened = await loadProjectFromPath(entry.path);
        if (opened) {
          toast.success(`Opened ${entry.name}`);
          setIngestError(null);
          setQueuedSource(null);
          setEntryVersion((version) => version + 1);
        } else {
          setIngestError(
            `Couldn't open ${entry.name}. The project may have moved or been damaged.`,
          );
        }
      } finally {
        setBusyProjectPath(null);
      }
    },
    [busyProjectPath, canReplaceProject],
  );

  const handleOpenProjectFile = useCallback(async (): Promise<void> => {
    if (starting.current || busyProjectPath || !canReplaceProject()) return;
    setBusyProjectPath('open-project');
    try {
      const opened = await loadProject();
      if (opened) {
        toast.success('Project loaded');
        setIngestError(null);
        setQueuedSource(null);
        setEntryVersion((version) => version + 1);
        void refreshRecents();
      }
    } finally {
      setBusyProjectPath(null);
    }
  }, [busyProjectPath, canReplaceProject, refreshRecents]);

  const runProjectAction = useCallback(
    async (
      entry: RecentProjectEntry,
      action: () => Promise<void>,
      success: string,
    ): Promise<void> => {
      if (starting.current || busyProjectPath) return;
      setBusyProjectPath(entry.path);
      try {
        await action();
        toast.success(success);
        await refreshRecents();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setIngestError(`${entry.name}: ${message}`);
        toast.error(message);
      } finally {
        setBusyProjectPath(null);
      }
    },
    [busyProjectPath, refreshRecents],
  );

  const confirmEntry = useCallback(
    async (draft: NewProjectDraft, intent: 'new' | 'add'): Promise<void> => {
      if (starting.current || busyProjectPath || !canStartEntry()) return;
      if (draft.source.kind === 'url' && !isYouTubeUrl(draft.source.value)) {
        setIngestError('Paste a valid YouTube video URL.');
        return;
      }
      if (
        draft.outputMode === 'longform' &&
        !findLongformPalette(
          draft.appearance.paletteId,
          useStore.getState().settings.customPalettes,
        )
      ) {
        setIngestError('Choose an available palette before generating.');
        return;
      }
      const projectId = useStore.getState().currentProject.id;
      starting.current = true;
      setIsStarting(true);
      setIngestError(null);
      try {
        if (useStore.getState().pythonStatus !== 'ready') return;
        if (!(await ensureScoringKey(draft.outputMode))) return;
        const source: SourceVideo = {
          id: makeId(),
          path: draft.source.kind === 'file' ? draft.source.value : '',
          name: draft.source.kind === 'file' ? basename(draft.source.value) : draft.source.value,
          duration: 0,
          width: 0,
          height: 0,
          origin: draft.source.kind === 'file' ? 'file' : 'youtube',
          ...(draft.source.kind === 'url' ? { youtubeUrl: draft.source.value } : {}),
          mediaStatus: 'online',
        };
        if (draft.source.kind === 'file') {
          const [metadata, thumbnail] = await Promise.allSettled([
            window.api.getMetadata(draft.source.value),
            window.api.getThumbnail(draft.source.value, 1),
          ]);
          if (metadata.status === 'rejected') throw metadata.reason;
          Object.assign(source, {
            duration: metadata.value.duration,
            width: metadata.value.width,
            height: metadata.value.height,
            ...(thumbnail.status === 'fulfilled' ? { thumbnail: thumbnail.value } : {}),
          });
        }
        // A native project command or setup may have changed state while probing.
        if (projectId !== useStore.getState().currentProject.id) {
          setIngestError('The active project changed. Review your source before confirming again.');
          return;
        }
        if (useStore.getState().pythonStatus !== 'ready' || !canStartEntry()) return;
        if (
          draft.outputMode === 'longform' &&
          !findLongformPalette(
            draft.appearance.paletteId,
            useStore.getState().settings.customPalettes,
          )
        ) {
          setIngestError(
            'The selected palette is no longer available. Choose another before generating.',
          );
          return;
        }
        if (intent === 'new') {
          if (!canReplaceProject()) return;
          createNewProject();
          setProjectDisplayName(draft.name);
          if (draft.profileId) {
            const profile = getCreatorProfiles().find((item) => item.id === draft.profileId);
            if (profile) {
              setCreatorProfile(profile.id);
              setProcessingConfig({ targetAudience: profile.audience });
              setTargetPlatform(profile.targetPlatform);
              setTemplateLayout(profile.templateLayout);
              setLongformSkin(profile.longformSkin);
              setLongformStoryboardStyle(
                profile.longformStoryboardStyle ?? DEFAULT_STORYBOARD_STYLE,
              );
              setLongformPaletteId(profile.longformPaletteId);
            }
          }
          if (draft.brief) {
            setCreativeBrief(draft.brief);
            commitCreativeBrief();
          }
        } else if (useStore.getState().currentProject.displayName === 'Untitled Project') {
          setProjectDisplayName(
            draft.source.kind === 'file' ? filenameStem(draft.source.value) : 'YouTube project',
          );
        }
        // Explicit dialog choices win after profile defaults, before any processing starts.
        if (draft.outputMode === 'longform') {
          setLongformStoryboardStyle(draft.appearance.storyboardStyle);
          setLongformPaletteId(draft.appearance.paletteId);
          const state = useStore.getState();
          const profile = getCreatorProfiles().find(
            (item) => item.id === state.creatorProfile.profileId,
          );
          if (profile) {
            if (draft.appearance.storyboardStyle === profile.longformStoryboardStyle)
              state.clearCreatorProfileOverride('longformStoryboardStyle');
            else
              state.setCreatorProfileOverride(
                'longformStoryboardStyle',
                draft.appearance.storyboardStyle,
              );
            if (draft.appearance.paletteId === profile.longformPaletteId)
              state.clearCreatorProfileOverride('longformPaletteId');
            else state.setCreatorProfileOverride('longformPaletteId', draft.appearance.paletteId);
          }
        }
        setOutputMode(draft.outputMode);
        addSource(source);
        setActiveSource(source.id);
        setImportOpen(false);
        setNewProjectOpen(false);
        setQueuedSource(null);
        setUrl('');
        if (intent === 'new') setEntryVersion((version) => version + 1);
        else setImportVersion((version) => version + 1);
        if (draft.outputMode === 'longform') await processLongform(source);
        else await processVideo(source);
      } catch (error) {
        const structured = addError({
          source: 'pipeline',
          error,
          message: `Failed to prepare ${draft.source.value}: ${error instanceof Error ? error.message : String(error)}`,
          failedStage: 'source-ingest',
        });
        setIngestError(
          `${structured.whatHappened} ${error instanceof Error ? error.message : String(error)}`,
        );
        toast.error(structured.headline);
      } finally {
        starting.current = false;
        setIsStarting(false);
      }
    },
    [
      addError,
      addSource,
      busyProjectPath,
      canReplaceProject,
      canStartEntry,
      commitCreativeBrief,
      ensureScoringKey,
      processLongform,
      processVideo,
      setActiveSource,
      setCreativeBrief,
      setCreatorProfile,
      setLongformPaletteId,
      setLongformSkin,
      setLongformStoryboardStyle,
      setOutputMode,
      setProcessingConfig,
      setProjectDisplayName,
      setTargetPlatform,
      setTemplateLayout,
    ],
  );

  return (
    <div className="studio-shell h-full w-full overflow-y-auto px-4 py-4 sm:px-6 min-[1100px]:px-8 min-[1100px]:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Project lobby</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Start from footage or pick up your last cut.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              id="new-project-button"
              variant="default"
              size="sm"
              disabled={isStarting || busyProjectPath !== null}
              onClick={() => {
                setIngestError(null);
                setKeyMissing(false);
                setNewProjectOpen(true);
              }}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden />
              New project
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isStarting || busyProjectPath !== null}
              onClick={() => void handleOpenProjectFile()}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              Open project
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isStarting || busyProjectPath !== null}
              onClick={() => void handleBrowse()}
            >
              <Import className="h-4 w-4" aria-hidden />
              Import video
            </Button>
          </div>
        </header>

        {queuedSource && !importOpen && (
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm" role="status">
              Your import selection is kept. Review it when you’re ready.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={isStarting || busyProjectPath !== null}
                onClick={() => setImportOpen(true)}
              >
                Review import
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isStarting}
                onClick={() => {
                  setQueuedSource(null);
                  setImportVersion((version) => version + 1);
                }}
              >
                Discard selection
              </Button>
            </div>
          </Card>
        )}

        {ingestError && !importOpen && !newProjectOpen && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>That action did not finish</AlertTitle>
            <AlertDescription className="break-words">{ingestError}</AlertDescription>
          </Alert>
        )}

        {showSetupCard && !importOpen && !newProjectOpen && <PythonSetupCard />}

        <Card
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'grid overflow-hidden border border-border bg-card shadow-none transition-[border-color,background-color,box-shadow,opacity] duration-150 min-[860px]:grid-cols-2',
            isDragOver && 'border-primary bg-primary/5 shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]',
            isStarting && 'opacity-65',
          )}
        >
          <button
            type="button"
            aria-label="Choose a video file or drop it here"
            disabled={isStarting}
            onClick={() => void handleBrowse()}
            className={cn(
              'group flex min-h-32 items-center gap-4 border-b border-dashed p-4 text-left min-[860px]:border-r min-[860px]:border-b-0 sm:p-5',
              'transition-[background-color,color] duration-150 hover:bg-muted/60',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
            )}
          >
            <Upload
              className={cn(
                'h-8 w-8 shrink-0 transition-colors duration-150',
                isDragOver ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
              strokeWidth={1.6}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-base font-semibold">Add footage</span>
              <span className="text-muted-foreground mt-1 block text-sm">
                Drop a video here or choose a file.
              </span>
              <span className="text-muted-foreground mt-2 block text-xs">
                MP4, MOV, AVI, MKV, WEBM, MTS, and M4V
              </span>
            </span>
          </button>

          <div className="flex min-w-0 flex-col justify-center gap-2 p-4 sm:p-5">
            <div className="grid gap-2">
              <Label htmlFor="lobby-youtube-url">YouTube URL</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <LinkIcon
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    id="lobby-youtube-url"
                    type="url"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setIngestError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleUrlSubmit();
                      }
                    }}
                    placeholder="Paste a YouTube link"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isStarting}
                    className="pl-9"
                  />
                </div>
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={!url.trim() || isStarting}
                  onClick={handleUrlSubmit}
                  aria-label="Import YouTube URL"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Adds to this project. Choose the outcome before processing starts.
              </p>
            </div>
          </div>
        </Card>

        {!showSetupCard && (
          <details className="group/recipe rounded-lg border border-border bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-medium">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
                {outputMode === 'longform' ? 'Explanation style' : 'Clip recipe'}
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                {outputMode === 'longform' ? 'Long-form · 16:9' : 'Short clips · 9:16'}
                <ChevronDown className="h-4 w-4 group-open/recipe:rotate-180" aria-hidden />
              </span>
            </summary>
            <div className="border-t border-border p-3">
              {outputMode === 'short' ? (
                <ProcessingRecipe disabled={isStarting} />
              ) : (
                <LongformAppearancePicker disabled={isStarting} />
              )}
            </div>
          </details>
        )}

        <RecentProjectLibrary
          projects={recents}
          loading={recentsLoading}
          error={recentsError}
          busyPath={isStarting ? 'source-import' : busyProjectPath}
          onRetry={() => void refreshRecents()}
          onOpen={(entry) => void handleOpenRecent(entry)}
          onNewProject={() => {
            setIngestError(null);
            setKeyMissing(false);
            setNewProjectOpen(true);
          }}
          onOpenProjectFile={() => void handleOpenProjectFile()}
          onReveal={(entry) =>
            void window.api.showItemInFolder(entry.path).catch((error: unknown) => {
              setIngestError(
                `Couldn’t reveal ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
              );
            })
          }
          onPin={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                setRecents(await window.api.setRecentProjectPinned(entry.path, !entry.pinned));
              },
              entry.pinned ? 'Project unpinned' : 'Project pinned',
            )
          }
          onRename={(entry, name) =>
            void runProjectAction(
              entry,
              async () => {
                const renamed = await window.api.renameRecentProject(entry.path, name);
                if (!renamed) throw new Error('The project could not be renamed.');
              },
              `Renamed to ${name}`,
            )
          }
          onDuplicate={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                const duplicated = await window.api.duplicateRecentProject(entry.path);
                if (!duplicated) throw new Error('The project could not be duplicated.');
              },
              'Project duplicated',
            )
          }
          onRemove={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                await window.api.removeRecentProject(entry.path);
              },
              'Removed from Recents',
            )
          }
          onDelete={(entry) =>
            void runProjectAction(
              entry,
              async () => {
                await window.api.deleteRecentProject(entry.path);
              },
              'Project file deleted',
            )
          }
        />
      </div>

      <NewProjectDialog
        key={`new-${entryVersion}`}
        open={newProjectOpen}
        busy={isStarting}
        error={ingestError}
        keyMissing={keyMissing}
        onOpenSettings={() => void handleOpenSettings()}
        onOpenChange={setNewProjectOpen}
        onChooseFile={chooseVideoPath}
        onCreate={(draft) => void confirmEntry(draft, 'new')}
      />
      <NewProjectDialog
        key={`add-${entryVersion}-${importVersion}`}
        intent="add"
        initialSource={queuedSource}
        open={importOpen}
        busy={isStarting}
        error={ingestError}
        keyMissing={keyMissing}
        onOpenSettings={() => void handleOpenSettings()}
        onOpenChange={setImportOpen}
        onChooseFile={chooseVideoPath}
        onCreate={(draft) => void confirmEntry(draft, 'add')}
      />
    </div>
  );
}
