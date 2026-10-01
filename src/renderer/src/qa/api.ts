import type { QaStateId } from './fixtures';
import {
  QA_CLIPS,
  QA_NOW,
  QA_POSTER,
  QA_PROJECT_PATH,
  QA_SOURCE,
  qaRecoveryJson,
} from './fixtures';

const noOp = (): void => {};
const unsubscribe = (): (() => void) => noOp;

function recentProjects() {
  return [
    {
      path: QA_PROJECT_PATH,
      name: 'Founder story, local QA fixture',
      sourceName: QA_SOURCE.name,
      lastOpened: QA_NOW - 18 * 60_000,
      clipCount: QA_CLIPS.length,
      selectedCount: QA_CLIPS.filter((clip) => clip.status === 'approved').length,
      sourceCount: 1,
      kind: 'short' as const,
      stage: 'Review',
      missingMedia: false,
      pinned: true,
      poster: QA_POSTER,
      selectedFrames: [QA_POSTER],
    },
    {
      path: '/QA-Fixtures/Product-walkthrough.batchclip',
      name: 'Product walkthrough, local QA fixture',
      sourceName: 'product-walkthrough-fixture.mp4',
      lastOpened: QA_NOW - 2 * 86_400_000,
      clipCount: 8,
      selectedCount: 3,
      sourceCount: 1,
      kind: 'longform' as const,
      stage: 'Export',
      missingMedia: false,
      pinned: false,
      poster: QA_POSTER,
      selectedFrames: [QA_POSTER],
    },
  ];
}

/**
 * Browser-only bridge for the checked-in deterministic showcase.
 * The real Electron preload remains untouched; this is installed only for #qa routes.
 */
export function installQaApi(stateId: QaStateId): void {
  const search = new URLSearchParams(window.location.search);
  const platform = search.get('platform') === 'win32' ? 'win32' : 'darwin';
  const secrets: Record<string, string> = {
    gemini: '',
    pexels: '',
    fal: '',
    outputDirectory: '/QA-Fixtures/Exports',
    autosaveIntervalMs: '60000',
  };

  const target: Record<PropertyKey, unknown> = {
    platform,
    setUiZoom: (factor: number) => {
      document.documentElement.dataset.qaNativeZoom = String(factor);
    },
    secrets: {
      get: async (name: string) => secrets[name] ?? null,
      set: async (name: string, value: string) => {
        secrets[name] = value;
      },
      has: async (name: string) => Boolean(secrets[name]),
      clear: async (name: string) => {
        delete secrets[name];
      },
    },
    getRecentProjects: async () => recentProjects(),
    openFiles: async () => [QA_SOURCE.path],
    getMetadata: async () => ({ duration: QA_SOURCE.duration, width: 1920, height: 1080 }),
    getThumbnail: async () => QA_POSTER,
    renderLongformScenePreview: async () => {
      const count = Number(document.documentElement.dataset.qaScenePreviewCalls ?? 0);
      document.documentElement.dataset.qaScenePreviewCalls = String(count + 1);
      return new URL('/__qa-media.mp4', window.location.href).href;
    },
    loadRecovery: async () => (stateId === 'recovery' ? qaRecoveryJson() : null),
    getPythonStatus: async () => ({
      ready: stateId !== 'setup' && stateId !== 'setup-error',
      stage: stateId === 'setup' ? 'not-setup' : stateId === 'setup-error' ? 'incomplete' : 'ready',
      storagePath: '/QA-Fixtures/BatchClip/python-env',
      freeDiskBytes: stateId === 'setup-error' ? 800 * 1024 ** 2 : 20 * 1024 ** 3,
      networkOnline: stateId !== 'setup-error',
      venvPath: '/QA-Fixtures/BatchClip/python-env/venv',
      embeddedPythonAvailable: false,
    }),
    getWaveform: async () =>
      Array.from(
        { length: 180 },
        (_, index) => Math.sin(index / 4) * 0.42 + Math.sin(index / 11) * 0.2,
      ),
    getAvailableFonts: async () => ['Inter', 'Bebas Neue', 'Instrument Serif'],
    renderPreview: () => new Promise<never>(() => undefined),
    getDefaultOutputDirectory: async () => '/QA-Fixtures/Exports',
    getDiskSpace: async () => ({ free: 42 * 1024 ** 3, total: 256 * 1024 ** 3 }),
    getEncoder: async () => ({
      encoder: platform === 'win32' ? 'h264_nvenc' : 'libx264',
      isHardware: platform === 'win32',
    }),
    getTempSize: async () => ({ bytes: 184 * 1024 ** 2, count: 14 }),
    getCacheSize: async () => ({ bytes: 72 * 1024 ** 2 }),
    getLogSize: async () => 2.4 * 1024 ** 2,
    cleanupTemp: async () => ({ deleted: 14, freed: 184 * 1024 ** 2 }),
    exportLogs: async () => ({ exportPath: '/QA-Fixtures/Diagnostics/batchclip-diagnostics.json' }),
    getUpdateState: async () => ({
      phase: 'idle',
      currentVersion: '0.1.0',
      availableVersion: null,
      progressPercent: null,
      message: null,
      manual: false,
    }),
    checkForUpdates: async () => ({
      phase: 'idle',
      currentVersion: '0.1.0',
      availableVersion: null,
      progressPercent: null,
      message: 'BatchClip is up to date.',
      manual: true,
    }),
    consumePendingProjectOpen: async () => null,
    checkMediaPaths: async (paths: string[]) =>
      paths.map((path) => ({ path, available: stateId !== 'missing-media' })),
    showItemInFolder: async () => undefined,
    openOutputFolder: async () => '/QA-Fixtures/Exports',
    setAutoCleanup: async () => undefined,
    setHistoryMenuState: async () => undefined,
    reportLifecycleState: async () => undefined,
    completeLifecyclePreparation: async () => undefined,
    setNativeProgress: async () => undefined,
    setPowerSaveActive: async () => undefined,
    sendNotification: async () => undefined,
    logToMain: noOp,
    setBadge: noOp,
    getPathForFile: (file: File) => `/QA-Fixtures/${file.name}`,
  };

  const api = new Proxy(target, {
    get(current, property) {
      if (property in current) return current[property];
      if (typeof property === 'string' && property.startsWith('on')) return unsubscribe;
      return (..._args: unknown[]) => Promise.resolve(null);
    },
  });

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: api,
  });
}
