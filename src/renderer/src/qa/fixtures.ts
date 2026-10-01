import { createStructuredError } from '@shared/errors';
import type { CreatorJob } from '@shared/jobs';
import type { LongformEditPlan } from '@shared/types';
import { useStore } from '@/store';
import type { ClipCandidate, PipelineStage, RenderProgress, SourceVideo } from '@/store/types';
import { DEFAULT_PROJECT_WORKSPACE } from '@/store/workspace-slice';
import { createQaScenePlan, QA_SCENE_DURATION, QA_SCENE_WORDS } from './scene-fixture';

export const QA_NOW = Date.UTC(2026, 6, 17, 14, 30, 0);
export const QA_PROJECT_PATH = '/QA-Fixtures/Founder-story.batchclip';
export const QA_SOURCE_PATH = '/QA-Fixtures/founder-story-interview.mp4';

export const QA_STATE_IDS = [
  'showcase',
  'lobby',
  'setup',
  'setup-error',
  'processing',
  'processing-error',
  'processing-cancelling',
  'clips',
  'no-results',
  'missing-media',
  'inspector',
  'cut-plan',
  'scene-review',
  'scene-export',
  'render-queue',
  'render-cancelling',
  'partial-success',
  'completion',
  'recovery',
  'settings',
  'errors',
] as const;

export type QaStateId = (typeof QA_STATE_IDS)[number];

export function parseQaState(hash: string): QaStateId | null {
  if (hash === '#qa' || hash === '#qa/') return 'showcase';
  const value = hash.replace(/^#qa\/?/, '').split(/[?&]/)[0];
  return QA_STATE_IDS.find((state) => state === value) ?? null;
}

const QA_POSTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
  <rect width="540" height="960" fill="#23100c"/>
  <rect x="28" y="28" width="484" height="904" rx="18" fill="#34201b" stroke="#9f75ff" stroke-width="2"/>
  <text x="54" y="90" fill="#f6ecd9" font-family="Inter, sans-serif" font-size="20" font-weight="700">LOCAL QA FIXTURE</text>
  <text x="54" y="126" fill="#cbbda9" font-family="monospace" font-size="16">FOUNDER STORY · 00:12:08</text>
  <path d="M54 520 L72 488 L90 548 L108 462 L126 535 L144 500 L162 565 L180 450 L198 525 L216 478 L234 552 L252 468 L270 530 L288 490 L306 558 L324 455 L342 540 L360 484 L378 548 L396 470 L414 532 L432 495 L450 550 L468 482" fill="none" stroke="#9f75ff" stroke-width="8" stroke-linecap="round"/>
  <line x1="270" y1="420" x2="270" y2="610" stroke="#f6ecd9" stroke-width="3"/>
  <text x="54" y="760" fill="#f6ecd9" font-family="Inter, sans-serif" font-size="30" font-weight="700">Find the signal.</text>
  <text x="54" y="804" fill="#f6ecd9" font-family="Inter, sans-serif" font-size="30" font-weight="700">Make the cut.</text>
  <rect x="54" y="850" width="432" height="12" rx="6" fill="#9f75ff"/>
</svg>`;

export const QA_POSTER = `data:image/svg+xml,${encodeURIComponent(QA_POSTER_SVG)}`;

export const QA_SOURCE: SourceVideo = {
  id: 'qa-source-founder-story',
  path: QA_SOURCE_PATH,
  name: 'founder-story-interview-practical-minimum-width-and-localization-stress.mp4',
  duration: 2_551,
  width: 1920,
  height: 1080,
  thumbnail: QA_POSTER,
  origin: 'file',
  mediaStatus: 'online',
};

export const QA_SIGNAL_CLIP: ClipCandidate = {
  id: 'qa-clip-signal',
  sourceId: QA_SOURCE.id,
  startTime: 728,
  endTime: 746,
  duration: 18,
  text: 'The fastest way to find the real signal is to ask a sharper question and keep the evidence close to the decision.',
  score: 94,
  originalScore: 94,
  hookText:
    'The fastest way to find the real signal without mistaking an easy metric for a useful one',
  reasoning:
    'The opening makes a concrete promise, then supports it with a clear editorial contrast.',
  status: 'approved',
  thumbnail: QA_POSTER,
  wordTimestamps: [
    { text: 'The', start: 728, end: 728.2 },
    { text: 'fastest', start: 728.2, end: 728.7 },
    { text: 'way', start: 728.7, end: 729 },
    { text: 'to', start: 729, end: 729.2 },
    { text: 'find', start: 729.2, end: 729.6 },
    { text: 'signal', start: 729.6, end: 730.2 },
  ],
};

export const QA_METRIC_CLIP: ClipCandidate = {
  id: 'qa-clip-metric',
  sourceId: QA_SOURCE.id,
  startTime: 1_102,
  endTime: 1_123,
  duration: 21,
  text: 'Most teams measure the wrong thing because the easy metric is not always the useful one.',
  score: 87,
  originalScore: 87,
  hookText: 'Most teams measure the wrong thing',
  reasoning: 'A concise contrast gives the viewer a reason to stay for the correction.',
  status: 'pending',
  thumbnail: QA_POSTER,
};

export const QA_TEST_CLIP: ClipCandidate = {
  id: 'qa-clip-test',
  sourceId: QA_SOURCE.id,
  startTime: 1_645,
  endTime: 1_662,
  duration: 17,
  text: 'A simple test can turn an uncertain decision into a small experiment.',
  score: 79,
  originalScore: 79,
  hookText: 'A simple test for better decisions',
  reasoning: 'The advice is useful, but its setup is slower than the other selects.',
  status: 'rejected',
  thumbnail: QA_POSTER,
};

export const QA_CLIPS: ClipCandidate[] = [QA_SIGNAL_CLIP, QA_METRIC_CLIP, QA_TEST_CLIP];

const QA_PLAN: LongformEditPlan = {
  phrases: [{ text: 'FIND THE SIGNAL', startTime: 728, endTime: 730.2 }],
  blocks: [
    {
      kind: 'callout',
      startTime: 1_102,
      endTime: 1_108,
      kicker: 'THE CONTRAST',
      heading: 'Easy is not useful',
      body: 'Keep the evidence beside the decision.',
    },
  ],
  cards: [
    {
      kind: 'delos-scan-result',
      startTime: 1_645,
      endTime: 1_651,
      sourceText: 'A simple test can turn an uncertain decision into a small experiment.',
    },
  ],
  reasoning:
    'Open on the strongest claim, prove it with the metric contrast, then close on the practical test.',
  generatedAt: QA_NOW - 4 * 60_000,
};

function processingJob(stage: PipelineStage, status: CreatorJob['status']): CreatorJob {
  return {
    id: 'qa-processing-job',
    kind: 'processing',
    projectId: 'qa-project-founder-story',
    projectName: 'Founder story, local QA fixture',
    projectFilePath: QA_PROJECT_PATH,
    sourceId: QA_SOURCE.id,
    sourceName: QA_SOURCE.name,
    outputMode: 'short',
    status,
    stage,
    progress: 47,
    message: stage === 'error' ? 'Transcription paused safely' : 'Transcribed 12:08 of 42:31',
    startedAt: QA_NOW - 92_000,
    stageStartedAt: QA_NOW - 68_000,
    updatedAt: QA_NOW,
    completedAt: null,
    completedStages: ['downloading'],
    failedStage: stage === 'error' ? 'transcribing' : null,
    cachedSourcePath: '/QA-Fixtures/cache/founder-story.wav',
    activities: [
      {
        id: 'qa-activity-download',
        stage: 'downloading',
        text: 'Prepared the local source',
        detail: '42:31 · 1920×1080',
        status: 'done',
        timestamp: QA_NOW - 80_000,
      },
      {
        id: 'qa-activity-transcript',
        stage: 'transcribing',
        text: 'Transcribed 12:08 of 42:31',
        detail: 'Cached work is kept if this run stops.',
        status: stage === 'error' ? 'error' : 'running',
        timestamp: QA_NOW - 12_000,
      },
    ],
    results: [
      {
        stage: 'downloading',
        label: 'Source ready',
        summary: '42:31 · 1920×1080',
        timestamp: QA_NOW - 80_000,
      },
    ],
    outputPaths: [],
    failedItemIds: [],
    progressSamples: [
      { at: QA_NOW - 40_000, percent: 31 },
      { at: QA_NOW - 20_000, percent: 40 },
      { at: QA_NOW, percent: 47 },
    ],
  };
}

const renderError = createStructuredError({
  source: 'render',
  message: 'ENOSPC while writing /Users/fixture/Exports/founder-story-02.mp4',
  failedStage: 'rendering',
  correlationId: 'BC-QA-RENDER-02',
});

function renderItems(mode: 'queue' | 'partial' | 'complete'): RenderProgress[] {
  const done: RenderProgress = {
    clipId: QA_SIGNAL_CLIP.id,
    kind: 'clip',
    label: QA_SIGNAL_CLIP.hookText,
    sourceId: QA_SOURCE.id,
    durationSeconds: QA_SIGNAL_CLIP.duration,
    percent: 100,
    status: 'done',
    outputPath: '/QA-Fixtures/Exports/founder-story-signal.mp4',
    checkpoints: ['prepared', 'encoded', 'output-verified'],
    completedAt: QA_NOW - 8_000,
    summary: 'Rendered with captions, crop, and hook title.',
  };
  if (mode === 'complete') {
    return [
      done,
      {
        ...done,
        clipId: QA_METRIC_CLIP.id,
        label: QA_METRIC_CLIP.hookText,
        outputPath: '/QA-Fixtures/Exports/founder-story-metric.mp4',
        completedAt: QA_NOW,
      },
    ];
  }
  if (mode === 'partial') {
    return [
      done,
      {
        clipId: QA_METRIC_CLIP.id,
        kind: 'clip',
        label: QA_METRIC_CLIP.hookText,
        sourceId: QA_SOURCE.id,
        durationSeconds: QA_METRIC_CLIP.duration,
        percent: 62,
        status: 'error',
        error: renderError,
      },
      {
        clipId: QA_TEST_CLIP.id,
        kind: 'clip',
        label: QA_TEST_CLIP.hookText,
        sourceId: QA_SOURCE.id,
        durationSeconds: QA_TEST_CLIP.duration,
        percent: 0,
        status: 'cancelled',
      },
    ];
  }
  return [
    done,
    {
      clipId: QA_METRIC_CLIP.id,
      kind: 'clip',
      label: QA_METRIC_CLIP.hookText,
      sourceId: QA_SOURCE.id,
      durationSeconds: QA_METRIC_CLIP.duration,
      percent: 64,
      status: 'rendering',
      prepareMessage: 'Encoding the vertical master',
      preparationActivities: [
        { id: 'captions', label: 'Built captions', status: 'done', timestamp: QA_NOW - 10_000 },
        { id: 'encode', label: 'Encoding output', status: 'running', timestamp: QA_NOW },
      ],
      startedAt: QA_NOW - 28_000,
    },
    {
      clipId: QA_TEST_CLIP.id,
      kind: 'clip',
      label: QA_TEST_CLIP.hookText,
      sourceId: QA_SOURCE.id,
      durationSeconds: QA_TEST_CLIP.duration,
      percent: 0,
      status: 'queued',
      queuePosition: 3,
    },
  ];
}

export function seedQaState(stateId: QaStateId): void {
  useStore.getState().reset();
  const isSceneFixture = stateId === 'scene-review' || stateId === 'scene-export';
  const hasSource = ![
    'showcase',
    'lobby',
    'setup',
    'setup-error',
    'recovery',
    'settings',
    'errors',
  ].includes(stateId);
  const pipelineStage: PipelineStage =
    stateId === 'processing' || stateId === 'processing-cancelling'
      ? 'transcribing'
      : stateId === 'processing-error'
        ? 'error'
        : stateId === 'render-queue' || stateId === 'render-cancelling'
          ? 'rendering'
          : stateId === 'partial-success' || stateId === 'completion' || stateId === 'scene-export'
            ? 'done'
            : 'ready';

  const processingState =
    stateId === 'processing-cancelling'
      ? { status: 'cancelling' as const, error: null }
      : { status: 'idle' as const, error: null };
  const renderState =
    stateId === 'render-cancelling'
      ? { status: 'cancelling' as const, error: null }
      : { status: 'idle' as const, error: null };

  useStore.setState((store) => {
    store.currentProject = {
      id: 'qa-project-founder-story',
      displayName: 'Founder story, local QA fixture',
      filePath: QA_PROJECT_PATH,
      createdAt: QA_NOW - 86_400_000,
      modifiedAt: QA_NOW,
      schemaVersion: 4,
    };
    store.sources = hasSource ? [{ ...QA_SOURCE }] : [];
    store.activeSourceId = hasSource ? QA_SOURCE.id : null;
    store.clips = hasSource ? { [QA_SOURCE.id]: QA_CLIPS.map((clip) => ({ ...clip })) } : {};
    store.transcriptions = hasSource
      ? {
          [QA_SOURCE.id]: {
            text: QA_CLIPS.map((clip) => clip.text).join(' '),
            formattedForAI: '[728|730.2|The fastest way to find signal]',
            segments: [],
            words: QA_SIGNAL_CLIP.wordTimestamps ?? [],
          },
        }
      : {};
    store.pipeline = {
      stage: pipelineStage,
      message:
        pipelineStage === 'transcribing'
          ? 'Transcribed 12:08 of 42:31'
          : pipelineStage === 'error'
            ? 'Transcription paused safely'
            : pipelineStage === 'done'
              ? 'Export pack ready'
              : 'Your selects are ready',
      percent: pipelineStage === 'transcribing' ? 47 : 100,
    };
    store.workspace = {
      ...DEFAULT_PROJECT_WORKSPACE,
      stage: pipelineStage,
      activeSourceId: hasSource ? QA_SOURCE.id : null,
      selectedClipId: stateId === 'inspector' ? QA_SIGNAL_CLIP.id : null,
      clipFilter: stateId === 'no-results' ? 'stitched' : 'all',
      inspectorTab: 'edit',
    };
    store.settings.outputDirectory = '/QA-Fixtures/Exports';
    store.settings.geminiApiKey = '';
    store.settings.outputMode = stateId === 'cut-plan' || isSceneFixture ? 'longform' : 'short';
    store.pythonStatus =
      stateId === 'setup'
        ? 'not-setup'
        : stateId === 'setup-error' || stateId === 'errors'
          ? 'error'
          : 'ready';
    store.pythonSetupDetails = {
      ready: stateId !== 'setup' && stateId !== 'setup-error' && stateId !== 'errors',
      stage:
        stateId === 'setup-error' || stateId === 'errors'
          ? 'incomplete'
          : stateId === 'setup'
            ? 'not-setup'
            : 'ready',
      storagePath: '/QA-Fixtures/BatchClip/python-env',
      freeDiskBytes:
        stateId === 'setup-error' || stateId === 'errors' ? 800 * 1024 ** 2 : 20 * 1024 ** 3,
      networkOnline: stateId !== 'setup-error' && stateId !== 'errors',
      venvPath: '/QA-Fixtures/BatchClip/python-env/venv',
      embeddedPythonAvailable: false,
    };
    store.pythonSetupError =
      stateId === 'setup-error' || stateId === 'errors'
        ? 'The local content tools could not download because the connection went offline.'
        : null;
    store.creatorJobs =
      stateId === 'processing' || stateId === 'processing-cancelling'
        ? [
            processingJob(
              'transcribing',
              stateId === 'processing-cancelling' ? 'cancelling' : 'running',
            ),
          ]
        : stateId === 'processing-error'
          ? [processingJob('error', 'paused')]
          : [];
    store.currentProcessingJobId = store.creatorJobs[0]?.id ?? null;
    store.processingCancellation = processingState;
    store.failedPipelineStage = stateId === 'processing-error' ? 'transcribing' : null;
    store.cachedSourcePath = hasSource ? '/QA-Fixtures/cache/founder-story.wav' : null;
    store.completedPipelineStages = new Set<PipelineStage>(hasSource ? ['downloading'] : []);
    store.renderProgress =
      stateId === 'render-queue' || stateId === 'render-cancelling'
        ? renderItems('queue')
        : stateId === 'partial-success'
          ? renderItems('partial')
          : stateId === 'completion'
            ? renderItems('complete')
            : [];
    store.isRendering = stateId === 'render-queue' || stateId === 'render-cancelling';
    store.renderCancellation = renderState;
    store.renderStartedAt = store.renderProgress.length ? QA_NOW - 36_000 : null;
    store.renderCompletedAt = pipelineStage === 'done' ? QA_NOW : null;
    store.renderErrors = Object.fromEntries(
      store.renderProgress.flatMap((item) =>
        item.status === 'error' && item.error ? [[item.clipId, item.error]] : [],
      ),
    );
    store.longformPlans =
      stateId === 'cut-plan'
        ? {
            [QA_SOURCE.id]: {
              plan: QA_PLAN,
              skin: 'editorial',
              paletteId: 'brand',
              versions: [
                {
                  id: 'qa-plan-v1',
                  plan: QA_PLAN,
                  origin: 'generated',
                  createdAt: QA_PLAN.generatedAt,
                },
              ],
              activeVersionId: 'qa-plan-v1',
              approvedVersionId: null,
              status: 'draft',
              feedback: [],
              preservedItems: [],
              reconciliation: null,
            },
          }
        : {};
    store.isDirty = stateId === 'inspector';
    store.saveStatus = stateId === 'inspector' ? 'saved' : 'idle';
    store.lastSavedAt = stateId === 'inspector' ? QA_NOW - 12_000 : null;
  });

  // The singleton store tracks project mutations after each setState call. Reset
  // that bookkeeping once the deterministic fixture has been installed.
  useStore.setState({
    isDirty: stateId === 'inspector',
    saveStatus: stateId === 'inspector' ? 'saved' : 'idle',
    projectRevision: 0,
    savedRevision: 0,
    lastSaveError: null,
  });
  if (isSceneFixture) {
    const sourceId = QA_SOURCE.id;
    const plan = createQaScenePlan();
    useStore.setState({
      sources: [
        {
          ...QA_SOURCE,
          name: 'Local scene-review media fixture',
          duration: QA_SCENE_DURATION,
          path: new URL('/__qa-media.mp4', window.location.href).href,
        },
      ],
      clips: {},
      stitchedClips: {},
      transcriptions: {
        [sourceId]: {
          words: QA_SCENE_WORDS,
          text: QA_SCENE_WORDS.map((word) => word.text).join(' '),
          formattedForAI: '',
          segments: [],
        },
      },
    });
    useStore.getState().setLongformPlan(sourceId, { plan, skin: 'editorial', paletteId: 'brand' });
    if (stateId === 'scene-export') {
      useStore.getState().acceptLongformPlan(sourceId, 'editorial', 'brand');
      useStore.getState().setLongformReconciliation(sourceId, {
        renderedAt: QA_NOW,
        outputPath: '/QA-Fixtures/Exports/scene-review.mp4',
        phrases: { planned: 0, eligible: 0, rendered: 0, dropped: 0 },
        blocks: { planned: 0, eligible: 0, rendered: 0, dropped: 0 },
        cards: { planned: 0, eligible: 0, rendered: 0, dropped: 0 },
        fallbacks: [
          {
            type: 'segment',
            count: 1,
            reason: 'Local fixture: explanation unavailable, speaker footage kept.',
          },
        ],
        scenes: { planned: 3, eligible: 2, rendered: 1, dropped: 2 },
        sceneResults: plan.scenes.map((item, index) => ({
          id: item.id,
          kind: item.kind,
          startTime: item.startTime,
          endTime: item.endTime,
          status: index === 0 ? 'rendered' : index === 1 ? 'failed' : 'omitted',
          ...(index === 1 ? { reason: 'Local fixture: draft render unavailable.' } : {}),
        })),
      });
      useStore.setState({
        renderProgress: [
          {
            clipId: sourceId,
            sourceId,
            kind: 'longform',
            status: 'done',
            percent: 100,
            outputPath: '/QA-Fixtures/Exports/scene-review.mp4',
          },
        ],
        renderCompletedAt: QA_NOW,
      });
    }
    useStore.setState({ isDirty: false });
  }
}

export function qaRecoveryJson(): string {
  return JSON.stringify({
    version: 4,
    identity: {
      id: 'qa-recovery-project',
      displayName: 'Founder story, recovered QA fixture',
      filePath: QA_PROJECT_PATH,
      createdAt: QA_NOW - 86_400_000,
      modifiedAt: QA_NOW - 90_000,
      schemaVersion: 4,
    },
    sources: [QA_SOURCE],
    transcriptions: {},
    clips: { [QA_SOURCE.id]: QA_CLIPS },
    stitchedClips: {},
    longformPlans: {},
    settings: {},
    processingConfig: {},
    workspace: {
      ...DEFAULT_PROJECT_WORKSPACE,
      stage: 'ready',
      activeSourceId: QA_SOURCE.id,
      selectedClipId: QA_SIGNAL_CLIP.id,
    },
    creativeBrief: {},
    renderState: {
      progress: renderItems('partial'),
      startedAt: QA_NOW - 120_000,
      completedAt: null,
    },
    recovery: { id: 'qa-recovery-snapshot', savedAt: QA_NOW - 90_000, stage: 'ready' },
  });
}
