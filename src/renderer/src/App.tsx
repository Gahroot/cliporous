import type { LifecycleSnapshot } from '@shared/app-lifecycle';
import type { CreatorJob } from '@shared/jobs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CommandPalette } from '@/components/CommandPalette';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import { StudioWorkspaceSkeleton } from '@/components/CreatorSkeletons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorLog } from '@/components/ErrorLog';
import { MissingMediaDialog } from '@/components/MissingMediaDialog';
import { RecoveryPrompt } from '@/components/RecoveryPrompt';
import { ReleaseSurfaces } from '@/components/ReleaseSurfaces';
import { StudioHeader } from '@/components/StudioHeader';
import { ClipGrid } from '@/components/screens/ClipGrid';
import { CutPlanReviewScreen } from '@/components/screens/CutPlanReviewScreen';
import { DropScreen } from '@/components/screens/DropScreen';
import { ProcessingScreen } from '@/components/screens/ProcessingScreen';
import { RenderScreen } from '@/components/screens/RenderScreen';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import type { KeyboardShortcutCallbacks } from '@/hooks';
import { useKeyboardShortcuts, usePythonSetup } from '@/hooks';
import { useAiTokenUsage } from '@/hooks/useAiTokenUsage';
import { useDesktopLifecycle } from '@/hooks/useDesktopLifecycle';
import { performHistoryCommand, useHistoryMenuSync } from '@/hooks/useHistoryControls';
import { useLongformPipeline } from '@/hooks/useLongformPipeline';
import { useNativeJobIntegration } from '@/hooks/useNativeJobIntegration';
import { stopActiveProcessingAndKeepProgress } from '@/hooks/usePipeline';
import { isMac, modifierKeyLabel } from '@/lib/platform';
import {
  createNewProject,
  loadProject,
  loadProjectFromPath,
  saveProject,
  saveProjectAs,
} from '@/services';
import { useDisplayPreferences } from '@/services/display-preferences';
import { resumeLastProject } from '@/services/project-service';
import { useStore } from '@/store';
import { selectIsLongformOnly, selectScreen } from '@/store/selectors';
import { listenForSettingsChanges } from '@/store/settings-sync';
import type { PipelineStage } from '@/store/types';

const ACTIVE_PROCESSING_STAGES = new Set([
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
]);

function waitForRenderSettlement(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The export did not confirm cancellation within 25 seconds.'));
    }, 25_000);
    const finish = (): void => {
      cleanup();
      resolve();
    };
    const offCancelled = window.api.onRenderCancelled(finish);
    const offDone = window.api.onRenderBatchDone(finish);
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      offCancelled();
      offDone();
    };

    void window.api.cancelRender().catch((error) => {
      cleanup();
      reject(error);
    });
  });
}

async function cancelActiveDesktopWork(): Promise<void> {
  const startingState = useStore.getState();
  const processing = ACTIVE_PROCESSING_STAGES.has(startingState.pipeline.stage);
  const rendering = startingState.isRendering || startingState.singleRenderStatus === 'rendering';

  if (processing) {
    const stopped = await stopActiveProcessingAndKeepProgress();
    if (!stopped) throw new Error('Processing is still stopping.');
  }
  if (rendering) {
    await waitForRenderSettlement();
    const state = useStore.getState();
    state.setIsRendering(false);
    state.setSingleRenderState({ status: 'idle' });
  }
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
  motionKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const yOffset = reduceMotion ? 0 : 8;
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
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcut help — a small dialog opened with `?` that documents the
// global shortcuts wired through useKeyboardShortcuts.
// ---------------------------------------------------------------------------

const MOD_KEY = modifierKeyLabel;

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD_KEY, 'K'], label: 'Open creator commands' },
  { keys: [MOD_KEY, 'N'], label: 'New project' },
  { keys: [MOD_KEY, 'S'], label: 'Save project' },
  { keys: [MOD_KEY, 'Shift', 'S'], label: 'Save project as' },
  { keys: [MOD_KEY, 'O'], label: 'Open project' },
  { keys: [MOD_KEY, ','], label: 'Settings' },
  { keys: [MOD_KEY, 'Z'], label: 'Undo project or active clip change' },
  {
    keys: isMac ? [MOD_KEY, 'Shift', 'Z'] : ['Ctrl', 'Y'],
    label: 'Redo project or active clip change',
  },
  { keys: [MOD_KEY, '+ / − / 0'], label: 'Zoom in, out, or reset' },
  { keys: [MOD_KEY, '/'], label: 'Show this help' },
];

function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Speed up your workflow with these global shortcuts.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="bg-muted text-foreground border-border inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const stage = useStore((s) => s.pipeline.stage);
  const activeSourceId = useStore((s) => s.activeSourceId);
  const currentProcessingJobId = useStore((s) => s.currentProcessingJobId);
  const hydrateSecretsFromMain = useStore((s) => s.hydrateSecretsFromMain);
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [processingForeground, setProcessingForeground] = useState(true);
  const { autoCleanupTemp } = useDisplayPreferences();
  const startupAutoCleanup = useRef(autoCleanupTemp);
  useHistoryMenuSync();
  useAiTokenUsage();
  useNativeJobIntegration();
  // The run must outlive DropScreen and the stage-keyed screen transitions.
  // Keep ownership here so only app teardown cancels it on unmount.
  const { processLongform } = useLongformPipeline();

  useEffect(() => {
    void window.api.setAutoCleanup(autoCleanupTemp);
  }, [autoCleanupTemp]);

  useEffect(() => {
    if (!startupAutoCleanup.current) return;
    void window.api.cleanupTemp().catch((error) => {
      window.api.logToMain(
        'warn',
        'storage',
        `Automatic temporary-file cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreWorkspace = async (): Promise<void> => {
      const startupProjectPath = await window.api.consumePendingProjectOpen();
      if (startupProjectPath) {
        const opened = await loadProjectFromPath(startupProjectPath);
        if (!opened) toast.error("Couldn't open that project file");
      } else {
        await resumeLastProject();
      }
      if (!cancelled) setWorkspaceReady(true);
    };
    void restoreWorkspace().catch((error) => {
      if (!cancelled) {
        setWorkspaceReady(true);
        toast.error(error instanceof Error ? error.message : "Couldn't restore the workspace");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canReplaceCurrentProject = useCallback((): boolean => {
    const state = useStore.getState();
    if (
      ACTIVE_PROCESSING_STAGES.has(state.pipeline.stage) ||
      state.isRendering ||
      state.singleRenderStatus === 'rendering'
    ) {
      toast.error('Finish or cancel active work before opening another project.');
      return false;
    }
    return (
      !state.isDirty ||
      window.confirm(`Discard unsaved changes to ${state.currentProject.displayName}?`)
    );
  }, []);

  const handleNewProject = useCallback((): void => {
    const state = useStore.getState();
    if (
      ACTIVE_PROCESSING_STAGES.has(state.pipeline.stage) ||
      state.isRendering ||
      state.singleRenderStatus === 'rendering'
    ) {
      toast.error('Finish or cancel active work before starting a new project.');
      return;
    }
    if (state.isDirty && !window.confirm('Discard unsaved changes and start a new project?')) {
      return;
    }
    createNewProject();
    toast.success('New project ready');
  }, []);

  const handleOpenProject = useCallback(async (): Promise<void> => {
    if (!canReplaceCurrentProject()) return;
    const ok = await loadProject();
    if (ok) toast.success('Project loaded');
  }, [canReplaceCurrentProject]);

  const handleOpenJob = useCallback(
    async (requestedJob: CreatorJob): Promise<void> => {
      let state = useStore.getState();
      if (requestedJob.projectId !== state.currentProject.id) {
        if (!requestedJob.projectFilePath || !canReplaceCurrentProject()) return;
        const opened = await loadProjectFromPath(requestedJob.projectFilePath);
        if (!opened) {
          toast.error("Couldn't open the job's project file");
          return;
        }
        state = useStore.getState();
      }
      const job =
        state.creatorJobs.find((candidate) => candidate.id === requestedJob.id) ?? requestedJob;
      if (job.kind === 'processing') {
        useStore.setState({ currentProcessingJobId: job.id });
        if (job.status === 'completed') {
          state.setPipeline({ stage: 'ready', message: job.message, percent: 100 });
        } else if (job.status === 'running' && ACTIVE_PROCESSING_STAGES.has(job.stage)) {
          state.setPipeline({
            stage: job.stage as PipelineStage,
            message: job.message,
            percent: state.pipeline.percent,
          });
        } else {
          const failedStage = ACTIVE_PROCESSING_STAGES.has(job.failedStage ?? job.stage)
            ? ((job.failedStage ?? job.stage) as PipelineStage)
            : 'transcribing';
          state.setFailedPipelineStage(failedStage);
          state.pauseProcessingJob(failedStage, job.message);
          state.setPipeline({
            stage: 'error',
            message: job.message,
            percent: state.pipeline.percent,
          });
        }
        setProcessingForeground(true);
        return;
      }
      state.setPipeline({
        stage: job.status === 'running' ? 'rendering' : 'done',
        message: job.message,
        percent: job.progress,
      });
    },
    [canReplaceCurrentProject],
  );

  // Global keyboard shortcuts. Mounted once at the App root; the hook attaches
  // a single window keydown listener and re-binds when the callbacks change.
  const shortcutCallbacks = useMemo<KeyboardShortcutCallbacks>(
    () => ({
      onNew: handleNewProject,
      onSave: async () => {
        await saveProject();
      },
      onSaveAs: async () => {
        await saveProjectAs();
      },
      onLoad: handleOpenProject,
      onOpenSettings: async () => {
        try {
          await window.api.openSettingsWindow();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Couldn't open settings: ${msg}`);
        }
      },
      onUndo: () => performHistoryCommand('undo'),
      onRedo: () => performHistoryCommand('redo'),
      onOpenCommands: () => setCommandPaletteOpen(true),
      onShowHelp: () => setHelpOpen((prev) => !prev),
    }),
    [handleNewProject, handleOpenProject],
  );
  useKeyboardShortcuts(shortcutCallbacks);

  const getLifecycleSnapshot = useCallback((): LifecycleSnapshot => {
    const state = useStore.getState();
    return {
      windowKind: 'main',
      projectName: state.currentProject.displayName,
      projectDirty: state.isDirty,
      settingsDirty: false,
      processingStage: ACTIVE_PROCESSING_STAGES.has(state.pipeline.stage)
        ? state.pipeline.stage
        : null,
      rendering: state.isRendering || state.singleRenderStatus === 'rendering',
    };
  }, []);

  const saveForLifecycle = useCallback(async (): Promise<boolean> => {
    if (!useStore.getState().isDirty) return true;
    const filePath = await saveProject();
    return filePath !== null && !useStore.getState().isDirty;
  }, []);

  useDesktopLifecycle({
    getSnapshot: getLifecycleSnapshot,
    onSave: saveForLifecycle,
    onCancelWork: cancelActiveDesktopWork,
  });

  useEffect(() => {
    const offNew = window.api.onProjectNewRequest(shortcutCallbacks.onNew);
    const offSave = window.api.onProjectSaveRequest(shortcutCallbacks.onSave);
    const offSaveAs = window.api.onProjectSaveAsRequest(shortcutCallbacks.onSaveAs);
    const offOpen = window.api.onProjectOpenRequest(shortcutCallbacks.onLoad);
    const offOpenRecent = window.api.onProjectOpenRecentRequest(({ path }) => {
      if (!canReplaceCurrentProject()) return;
      void loadProjectFromPath(path).then((ok) => {
        if (ok) toast.success('Project loaded');
        else toast.error("Couldn't open that project file");
      });
    });
    const offSettings = window.api.onSettingsOpenRequest(shortcutCallbacks.onOpenSettings);
    const offHelp = window.api.onKeyboardShortcutsRequest(shortcutCallbacks.onShowHelp);
    const offUndo = window.api.onEditUndoRequest(shortcutCallbacks.onUndo);
    const offRedo = window.api.onEditRedoRequest(shortcutCallbacks.onRedo);
    return () => {
      offNew();
      offSave();
      offSaveAs();
      offOpen();
      offOpenRecent();
      offSettings();
      offHelp();
      offUndo();
      offRedo();
    };
  }, [canReplaceCurrentProject, shortcutCallbacks]);

  useEffect(() => {
    if (currentProcessingJobId) setProcessingForeground(true);
  }, [currentProcessingJobId]);

  useEffect(
    () =>
      window.api.onNotificationClicked((payload) => {
        if (!payload.jobId) return;
        const job = useStore
          .getState()
          .creatorJobs.find((candidate) => candidate.id === payload.jobId);
        if (job) void handleOpenJob(job);
      }),
    [handleOpenJob],
  );

  // Wire python:setupProgress / python:setupDone listeners into the store so
  // DropScreen can render the first-run install card. Mounted once at the App
  // root. The hook is idempotent.
  usePythonSetup();

  // Hydrate API keys from the main-process safeStorage on first paint.
  // The Settings window writes via window.api.secrets.set(...) and the main
  // window's Zustand state is empty until this runs. Without this the
  // pipeline's scoring step fails with "API key required".
  useEffect(() => {
    void hydrateSecretsFromMain();
    // Re-hydrate whenever the Settings window saves, so freshly entered keys /
    // output dir take effect in the main store immediately — independent of
    // BroadcastChannel availability or mount timing.
    return listenForSettingsChanges(() => void hydrateSecretsFromMain());
  }, [hydrateSecretsFromMain]);

  const isLongformOnly = useStore(selectIsLongformOnly);
  const screen = useMemo(() => {
    const routedScreen = selectScreen(stage, activeSourceId !== null, isLongformOnly);
    return routedScreen === 'processing' && !processingForeground ? 'drop' : routedScreen;
  }, [stage, activeSourceId, isLongformOnly, processingForeground]);

  if (!workspaceReady) return <StudioWorkspaceSkeleton />;

  return (
    <ErrorBoundary>
      <div className="studio-shell flex h-full w-full max-w-[100vw] flex-col overflow-x-hidden bg-background text-foreground">
        <StudioHeader
          activeScreen={screen}
          stage={stage}
          onNew={shortcutCallbacks.onNew}
          onOpen={shortcutCallbacks.onLoad}
          onSave={shortcutCallbacks.onSave}
          onSaveAs={shortcutCallbacks.onSaveAs}
          onOpenCommands={shortcutCallbacks.onOpenCommands}
          onShowShortcuts={() => setHelpOpen(true)}
          onOpenJob={handleOpenJob}
        />
        <ReleaseSurfaces />
        <MissingMediaDialog />
        <main className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <ScreenFrame key={stage} motionKey={stage}>
              {screen === 'drop' && <DropScreen processLongform={processLongform} />}
              {screen === 'processing' && (
                <ProcessingScreen onBackground={() => setProcessingForeground(false)} />
              )}
              {screen === 'clips' && <ClipGrid />}
              {screen === 'cut-plan' && <CutPlanReviewScreen />}
              {screen === 'render' && <RenderScreen />}
            </ScreenFrame>
          </AnimatePresence>
        </main>
        <ErrorLog />
      </div>
      <Toaster />
      <CompletionCelebration />
      <RecoveryPrompt />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNew={shortcutCallbacks.onNew}
        onOpen={shortcutCallbacks.onLoad}
        onSave={shortcutCallbacks.onSave}
        onSaveAs={shortcutCallbacks.onSaveAs}
        onShowShortcuts={() => setHelpOpen(true)}
      />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </ErrorBoundary>
  );
}
