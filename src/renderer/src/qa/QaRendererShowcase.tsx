import { createStructuredError } from '@shared/errors';
import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  CircleStop,
  FolderSearch2,
  HardDrive,
  KeyRound,
  LoaderCircle,
  type LucideIcon,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import App from '@/App';
import { ConnectionCard } from '@/components/ConnectionCard';
import { ErrorPresentation } from '@/components/ErrorPresentation';
import { OfflineMediaPlaceholder } from '@/components/OfflineMediaPlaceholder';
import { PythonSetupCard } from '@/components/PythonSetupCard';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import SettingsWindow from '@/SettingsWindow';
import { QA_STATE_IDS, type QaStateId } from './fixtures';

const STATE_LABELS: Record<QaStateId, string> = {
  showcase: 'Showcase index',
  lobby: 'Project lobby',
  setup: 'First-run setup',
  'setup-error': 'Setup recovery',
  processing: 'Processing',
  'processing-error': 'Processing error',
  'processing-cancelling': 'Processing cancellation',
  clips: 'Clip review',
  'no-results': 'Review no results',
  'missing-media': 'Missing media',
  inspector: 'Clip inspector',
  'cut-plan': 'Legacy Cut Plan review',
  'scene-review': 'Focused scene review',
  'scene-export': 'Scene export with changes',
  'render-queue': 'Render queue',
  'render-cancelling': 'Render cancellation',
  'partial-success': 'Partial success',
  completion: 'Full success',
  recovery: 'Crash recovery',
  settings: 'Settings and connections',
  errors: 'State completeness matrix',
};

function openQaState(stateId: QaStateId): void {
  window.location.hash = `qa/${stateId}`;
  window.location.reload();
}

function QaFixtureNotice({ stateId }: { stateId: QaStateId }): React.JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const modes = [
    params.get('zoom') === '2' ? '200% native zoom simulation' : null,
    params.get('motion') === 'reduce' ? 'reduced motion' : null,
    params.get('contrast') === 'forced' ? 'high contrast' : null,
    params.get('theme') === 'dark' ? 'dark theme' : null,
  ].filter(Boolean);
  return (
    <div className="border-b border-primary/25 bg-primary/10 px-3 py-1.5 text-center text-[11px] font-medium text-foreground">
      Deterministic local QA fixture: {STATE_LABELS[stateId]}. Values and media are fixture-labeled.
      {modes.length > 0 ? ` Mode: ${modes.join(', ')}.` : ''}
    </div>
  );
}

function ShowcaseIndex(): React.JSX.Element {
  return (
    <main className="h-full overflow-y-auto bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="filmstrip-rule border-b pb-5">
          <div className="flex items-center gap-2 text-primary">
            <AppWindow className="h-5 w-5" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">
              Renderer release evidence
            </p>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Deterministic UX state showcase
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Real BatchClip components with a fixed local creator project, fixed timestamps, neutral
            source media, and no credentials or personal paths. Open any state directly for desktop,
            900-pixel minimum, zoom, theme, reduced-motion, and forced-color review.
          </p>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="QA states">
          {QA_STATE_IDS.filter((stateId) => stateId !== 'showcase').map((stateId) => (
            <Card key={stateId} className="flex min-h-32 flex-col justify-between gap-4 p-4">
              <div>
                <Badge variant="outline" className="font-mono text-[10px] uppercase">
                  {stateId}
                </Badge>
                <h2 className="mt-2 text-sm font-semibold">{STATE_LABELS[stateId]}</h2>
              </div>
              <button
                type="button"
                className="min-h-10 rounded-md border border-border bg-secondary px-3 text-left text-sm font-medium text-secondary-foreground transition-[background-color,border-color] duration-150 hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openQaState(stateId)}
              >
                Open deterministic state
              </button>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}

const OFFLINE_ERROR = createStructuredError({
  source: 'pipeline',
  message: 'Network offline while requesting transcript scoring',
  failedStage: 'scoring',
  correlationId: 'BC-QA-OFFLINE-01',
});
const KEY_ERROR = createStructuredError({
  source: 'gemini',
  message: 'Gemini API key AIzaQA_FIXTURE_SECRET_123456789012345 returned HTTP 401',
  failedStage: 'scoring',
  correlationId: 'BC-QA-KEY-01',
});
const MEDIA_ERROR = createStructuredError({
  source: 'pipeline',
  message: 'Missing source /Users/fixture/Videos/founder-story-interview.mp4',
  failedStage: 'source-ingest',
  correlationId: 'BC-QA-MEDIA-01',
});
const DISK_ERROR = createStructuredError({
  source: 'render',
  message: 'ENOSPC while writing C:\\Users\\fixture\\Videos\\BatchClip\\founder-story.mp4',
  failedStage: 'rendering',
  correlationId: 'BC-QA-DISK-01',
});

const OUTCOME_STATES: Array<{
  icon: LucideIcon;
  label: string;
  detail: string;
  iconClass?: string;
}> = [
  {
    icon: LoaderCircle,
    label: 'Loading',
    detail: 'Checking source media',
    iconClass: 'animate-spin',
  },
  { icon: FolderSearch2, label: 'Empty', detail: 'Choose a source to begin' },
  { icon: CircleStop, label: 'Canceled', detail: 'Completed work kept' },
  {
    icon: CheckCircle2,
    label: 'Partial success',
    detail: '1 complete, 1 failed, 1 canceled',
  },
];

function StateCompletenessMatrix(): React.JSX.Element {
  return (
    <main className="h-full overflow-y-auto bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            State completeness
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Recovery stays beside the problem
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Every entry below is a fixed local fixture rendered through the same error, connection,
            setup, and media components used by the production flow.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Outcome states">
          {OUTCOME_STATES.map(({ icon: Icon, label, detail, iconClass }) => (
            <Card key={label} className="p-4">
              <Icon className={`h-5 w-5 text-primary ${iconClass ?? ''}`} aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold">{label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Connection states">
          <ConnectionCard
            id="qa-missing-key"
            name="Gemini"
            description="Scores transcript moments and prepares cut plans."
            icon={Sparkles}
            required
            value=""
            placeholder="AIza…"
            state="not-configured"
            feedback="Add a key before AI scoring."
            impact="Local transcription, manual review, and rendering remain available."
            onChange={() => undefined}
            onTest={() => undefined}
          />
          <ConnectionCard
            id="qa-invalid-key"
            name="Gemini test"
            description="This fixture proves invalid credentials preserve the form and recovery action."
            icon={KeyRound}
            required
            value="fixture-value-is-never-exported"
            placeholder="AIza…"
            state="invalid"
            feedback="The provider rejected this key. Update it, then test again."
            impact="AI scoring is paused. Existing clips and local exports are safe."
            onChange={() => undefined}
            onTest={() => undefined}
          />
        </section>

        <section className="grid gap-4" aria-label="Structured errors">
          <ErrorPresentation
            error={OFFLINE_ERROR}
            actions={[{ label: 'Resume', onClick: () => undefined, icon: WifiOff }]}
          />
          <ErrorPresentation
            error={KEY_ERROR}
            actions={[{ label: 'Open Settings', onClick: () => undefined, icon: KeyRound }]}
          />
          <ErrorPresentation
            error={MEDIA_ERROR}
            actions={[{ label: 'Relink source', onClick: () => undefined, icon: FolderSearch2 }]}
          />
          <ErrorPresentation
            error={DISK_ERROR}
            actions={[{ label: 'Free space', onClick: () => undefined, icon: HardDrive }]}
          />
        </section>

        <section
          className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
          aria-label="Setup and media recovery"
        >
          <PythonSetupCard queuedSourceName="founder-story-interview.mp4" />
          <Card className="overflow-hidden">
            <div className="aspect-video min-h-48">
              <OfflineMediaPlaceholder fileName="founder-story-interview.mp4" />
            </div>
            <div className="border-t p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                Missing media keeps review data available
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

export function QaRendererShowcase({ stateId }: { stateId: QaStateId }): React.JSX.Element {
  document.title = `BatchClip QA fixture: ${STATE_LABELS[stateId]}`;

  if (stateId === 'showcase') return <ShowcaseIndex />;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background">
      <QaFixtureNotice stateId={stateId} />
      <div className="min-h-0">
        {stateId === 'settings' ? (
          <SettingsWindow />
        ) : stateId === 'errors' ? (
          <StateCompletenessMatrix />
        ) : (
          <App />
        )}
      </div>
    </div>
  );
}
