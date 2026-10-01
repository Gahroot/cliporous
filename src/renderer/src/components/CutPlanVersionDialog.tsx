import { isSceneFirstPlanEnvelope } from '@shared/longform-scenes';
import { ArrowRightLeft, History, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  compareLongformPlans,
  humanizeLongformKind,
  isScenePlanForReview,
} from '@/lib/longform-plan';
import type { LongformPlanVersion } from '@/store/longform-slice';

interface CutPlanVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: LongformPlanVersion[];
  activeVersionId: string | undefined;
  onRestore: (versionId: string) => void;
}

function versionLabel(version: LongformPlanVersion, index: number): string {
  return `Version ${index + 1}, ${humanizeLongformKind(version.origin)}, ${new Date(
    version.createdAt,
  ).toLocaleString()}`;
}

function VersionSummary({ version }: { version: LongformPlanVersion }): React.JSX.Element {
  const plan = version.plan;
  const scenePlan = isSceneFirstPlanEnvelope(plan) ? plan : null;
  const unsupported = isScenePlanForReview(plan) && !scenePlan;
  const kinds = new Map<string, number>();
  for (const item of scenePlan?.scenes ?? (unsupported ? [] : plan.blocks))
    kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
  const counts = scenePlan
    ? [
        ['Included scenes', scenePlan.scenes.filter((scene) => !scene.omitted).length],
        ['Omitted scenes', scenePlan.scenes.filter((scene) => scene.omitted).length],
        [
          'Failed sections',
          scenePlan.sections.filter((section) => section.status === 'failed').length,
        ],
      ]
    : unsupported
      ? []
      : [
          ['Phrases', plan.phrases.length],
          ['Blocks', plan.blocks.length],
          ['Cards', plan.cards?.length ?? 0],
        ];
  return (
    <section
      className="min-w-0 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]"
      aria-label="Plan version summary"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{humanizeLongformKind(version.origin)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(version.createdAt).toLocaleString()}
          </p>
        </div>
        <History className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {scenePlan ? 'Scene-first plan' : unsupported ? 'Unsupported saved plan' : 'Legacy plan'}
        {version.paletteId ? ` · Palette: ${version.paletteId}` : ''}
      </p>
      {(unsupported || version.validationProblem) && (
        <p className="mt-2 text-xs text-warning">
          {version.validationProblem ||
            'Saved data is retained, but this version cannot be exported.'}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-1 gap-2 text-center text-xs sm:grid-cols-3">
        {counts.map(([label, count]) => (
          <div key={label} className="rounded border border-border/70 bg-muted/45 px-2 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
      {kinds.size > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {Array.from(kinds.entries())
            .sort((left, right) => right[1] - left[1])
            .map(([kind, count]) => `${count} ${humanizeLongformKind(kind)}`)
            .join(', ')}
        </p>
      )}
      {version.note && <p className="mt-3 text-xs text-foreground">{version.note}</p>}
    </section>
  );
}

export function CutPlanVersionDialog({
  open,
  onOpenChange,
  versions,
  activeVersionId,
  onRestore,
}: CutPlanVersionDialogProps): React.JSX.Element {
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');

  useEffect(() => {
    if (!open || versions.length === 0) return;
    const activeIndex = versions.findIndex((version) => version.id === activeVersionId);
    const index = activeIndex < 0 ? versions.length - 1 : activeIndex;
    const active = versions[index];
    const previous = versions[Math.max(0, index - 1)];
    setRightId(active?.id ?? '');
    setLeftId(previous?.id ?? active?.id ?? '');
  }, [activeVersionId, open, versions]);

  const left = versions.find((version) => version.id === leftId) ?? versions[0];
  const right = versions.find((version) => version.id === rightId) ?? versions.at(-1);
  const diff = useMemo(
    () => (left && right ? compareLongformPlans(left.plan, right.plan) : null),
    [left, right],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100%_-_2rem)] min-w-0 max-w-4xl overflow-y-auto [overflow-wrap:anywhere]">
        <DialogHeader>
          <DialogTitle>Compare Cut Plan versions</DialogTitle>
          <DialogDescription>
            Compare generated, edited, and approved plans. Restoring uses saved work and does not
            call AI. Restored and regenerated versions are drafts requiring review, not approval.
            Scene changes are matched by stable scene ID. Start with the active version and its
            prior snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cut-plan-left-version">Earlier version</Label>
            <select
              id="cut-plan-left-version"
              value={leftId}
              onChange={(event) => setLeftId(event.target.value)}
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {versions.map((version, index) => (
                <option key={version.id} value={version.id}>
                  {versionLabel(version, index)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="cut-plan-right-version">Later version</Label>
            <select
              id="cut-plan-right-version"
              value={rightId}
              onChange={(event) => setRightId(event.target.value)}
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {versions.map((version, index) => (
                <option key={version.id} value={version.id}>
                  {versionLabel(version, index)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {left && right && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <VersionSummary version={left} />
              <VersionSummary version={right} />
            </div>
            {diff && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs">
                <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden />
                <span>
                  <strong>{diff.added}</strong> added
                </span>
                <span>
                  <strong>{diff.removed}</strong> removed
                </span>
                <span>
                  <strong>{diff.timingChanges}</strong> timing changes
                </span>
                <span>
                  <strong>{diff.contentChanges}</strong> scene changes
                </span>
                <span>
                  <strong>{diff.unchanged}</strong> unchanged
                </span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!left) return;
              onRestore(left.id);
              onOpenChange(false);
            }}
            disabled={!left || left.id === activeVersionId}
          >
            <RotateCcw />
            Restore earlier version
          </Button>
          <Button
            onClick={() => {
              if (!right) return;
              onRestore(right.id);
              onOpenChange(false);
            }}
            disabled={!right || right.id === activeVersionId}
          >
            <RotateCcw />
            Restore selected version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
