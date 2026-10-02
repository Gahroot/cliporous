import { LONGFORM_PRESENTATION_LABELS } from '@shared/longform-scenes';
import type { WordTimestamp } from '@shared/types';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageSquareText,
  Pencil,
  Unlock,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatTimecode,
  type LongformPlanItemView,
  storyboardPanelSummary,
} from '@/lib/longform-plan';
import { cn } from '@/lib/utils';

interface LongformSceneWorkspaceProps {
  items: LongformPlanItemView[];
  words?: readonly WordTimestamp[];
  selectedSceneId: string;
  preservedKeys: ReadonlySet<string>;
  disabled: boolean;
  issue?: string | undefined;
  onSelect: (sceneId: string) => void;
  onEdit: (item: LongformPlanItemView, trigger: HTMLButtonElement) => void;
  onFeedback: (item: LongformPlanItemView) => void;
  onTogglePreserve: (item: LongformPlanItemView) => void;
  onToggleOmit: (item: LongformPlanItemView) => void;
  children: ReactNode;
}

function repeatsSource(purpose: string, source: string): boolean {
  const normalize = (text: string): string =>
    text
      .trim()
      .replace(/^["“‘']|["”’']$/g, '')
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  return normalize(purpose.replace(/^Explain the source passage:\s*/i, '')) === normalize(source);
}

/** Selection is navigation only; inclusion and preservation remain explicit editorial decisions. */
export function LongformSceneWorkspace({
  items,
  words = [],
  selectedSceneId,
  preservedKeys,
  disabled,
  issue,
  onSelect,
  onEdit,
  onFeedback,
  onTogglePreserve,
  onToggleOmit,
  children,
}: LongformSceneWorkspaceProps): React.JSX.Element | null {
  const id = useId();
  const index = items.findIndex((item) => item.key === selectedSceneId);
  const selected = items[index];
  if (!selected?.scene) return null;
  const preserved = preservedKeys.has(selected.key);
  const panels = storyboardPanelSummary(selected.scene, words);
  const overview = selected.scene.sourceSpec.overview;
  const overviewWord =
    overview && typeof overview === 'object' && !Array.isArray(overview)
      ? overview.atWord
      : undefined;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <nav
        aria-label="Scene queue"
        className="min-w-0 self-start rounded-lg border border-border bg-card p-3 md:sticky md:top-0"
      >
        <h2 className="text-sm font-semibold">Scenes in source order</h2>
        <div className="mt-2 md:hidden">
          <label htmlFor={`${id}-select`} className="sr-only">
            Scene in source order
          </label>
          <div className="relative mt-1">
            <select
              id={`${id}-select`}
              value={selectedSceneId}
              onChange={(event) => onSelect(event.target.value)}
              className="h-10 w-full min-w-0 max-w-full appearance-none rounded-md border border-input bg-background ps-3 pe-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {items.map((item, position) => (
                <option key={item.key} value={item.key}>
                  {position + 1}. {item.title} · {item.scene?.omitted ? 'Omitted' : 'Included'}
                  {preservedKeys.has(item.key) ? ' · Preserved' : ''}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          </div>
        </div>
        <ol className="mt-3 hidden max-h-[60vh] space-y-1 overflow-y-auto md:block">
          {items.map((item, position) => (
            <li key={item.key}>
              <button
                type="button"
                aria-current={item.key === selectedSceneId ? 'true' : undefined}
                aria-controls={`${id}-detail`}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'w-full min-w-0 rounded-md border p-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
                  item.key === selectedSceneId
                    ? 'border-primary/45 bg-primary/10'
                    : 'border-transparent',
                )}
              >
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {position + 1} · {formatTimecode(item.startTime)}–{formatTimecode(item.endTime)}
                </span>
                <span className="mt-0.5 block break-words text-sm font-medium [overflow-wrap:anywhere]">
                  {item.title}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {item.scene?.omitted ? 'Omitted' : 'Included'}
                  {preservedKeys.has(item.key) ? ' · Preserved' : ''}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section
        id={`${id}-detail`}
        aria-label="Selected scene"
        className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-3 sm:p-4 [overflow-wrap:anywhere]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground" role="status">
            Scene {index + 1} of {items.length}
          </p>
          <fieldset className="flex min-w-0 flex-wrap gap-1" aria-label="Scene navigation">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous scene"
              disabled={index <= 0}
              onClick={() => {
                const item = items[index - 1];
                if (item) onSelect(item.key);
              }}
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next scene"
              disabled={index >= items.length - 1}
              onClick={() => {
                const item = items[index + 1];
                if (item) onSelect(item.key);
              }}
            >
              Next
              <ChevronRight aria-hidden />
            </Button>
          </fieldset>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected.scene.omitted ? 'Omitted' : 'Included'}</Badge>
            {preserved && (
              <Badge variant="outline">
                <Lock className="mr-1 h-3 w-3" aria-hidden />
                Preserved
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {selected.kind} · {LONGFORM_PRESENTATION_LABELS[selected.scene.presentation]}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold">{selected.title}</h2>
          {selected.scene.omitted && (
            <p className="mt-1 text-xs text-muted-foreground">
              This explanation is omitted. The source narration remains.
            </p>
          )}
        </div>
        <fieldset className="flex min-w-0 flex-wrap gap-1" aria-label="Selected scene decisions">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={(event) => onEdit(selected, event.currentTarget)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onToggleOmit(selected)}
          >
            {selected.scene.omitted ? 'Include scene' : 'Omit scene'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-pressed={preserved}
            title={
              preserved
                ? 'Allow regeneration to change this scene'
                : 'Keep this scene unchanged during regeneration'
            }
            onClick={() => onTogglePreserve(selected)}
          >
            {preserved ? <Unlock aria-hidden /> : <Lock aria-hidden />}
            {preserved ? 'Release' : 'Preserve'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onFeedback(selected)}
          >
            <MessageSquareText aria-hidden />
            Scene feedback
          </Button>
        </fieldset>
        {issue && (
          <p className="text-xs text-warning">
            {issue} Omit this scene or request a new draft; timing is never shortened.
          </p>
        )}
        {selected.scene.kind === 'storyboard' && (
          <section
            aria-label="Storyboard panels and beats"
            className="min-w-0 space-y-2 rounded-md border border-border p-3"
          >
            <h3 className="text-sm font-semibold">
              Continuous storyboard · {panels.length} {panels.length === 1 ? 'panel' : 'panels'}
            </h3>
            <p className="text-xs text-muted-foreground">
              Full-screen only. Source-indexed reveals, camera moves and final holds stay intact.
              Use scene feedback to request timing changes.
            </p>
            <ol className="grid min-w-0 gap-2">
              {panels.map((panel, position) => (
                <li key={panel.id} className="min-w-0 border-t border-border pt-2 text-xs">
                  <p className="font-medium">
                    {position + 1}. {panel.title} · {panel.kind}
                  </p>
                  <p className="mt-1 text-muted-foreground">{panel.beats.join(' · ')}</p>
                </li>
              ))}
            </ol>
            {typeof overviewWord === 'number' && (
              <p className="text-xs text-muted-foreground">
                Final overview ·{' '}
                {words[overviewWord]
                  ? formatTimecode(words[overviewWord].start)
                  : 'Timing unavailable'}
              </p>
            )}
          </section>
        )}
        {children}
        <section
          aria-label="Source passage"
          className="min-w-0 rounded-md border border-border bg-muted/25 p-3"
        >
          <h3 className="text-xs font-semibold">
            Source passage · {formatTimecode(selected.startTime)}–{formatTimecode(selected.endTime)}
          </h3>
          <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed">
            <span className="sr-only">Transcript source: </span>
            {selected.sourceText || 'No transcript excerpt is available for this timing.'}
          </blockquote>
          {!repeatsSource(selected.detail, selected.sourceText) && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Scene intent
              </summary>
              <p className="mt-2">{selected.detail}</p>
            </details>
          )}
        </section>
      </section>
    </div>
  );
}
