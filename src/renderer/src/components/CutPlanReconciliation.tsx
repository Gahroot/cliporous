import type { LongformScenePlacement, LongformSceneRenderResult } from '@shared/longform-scenes';
import type { LongformRenderReconciliation } from '@shared/types';
import { AlertTriangle, CheckCircle2, FileVideo2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatTimecode, humanizeLongformKind } from '@/lib/longform-plan';

interface CutPlanReconciliationProps {
  reconciliation: LongformRenderReconciliation;
  compact?: boolean;
  scenes?: readonly LongformScenePlacement[];
  onReviewScene?: (sceneId: string) => void;
  reviewDisabled?: boolean;
  reviewableSceneIds?: readonly string[];
}

const ROWS = [
  ['Explanation scenes', 'scenes'],
  ['Phrase overlays', 'phrases'],
  ['Content blocks', 'blocks'],
  ['Evidence cards', 'cards'],
] as const;

export function hasReconciliationChanges(
  reconciliation: LongformRenderReconciliation,
  scenes: readonly LongformScenePlacement[] = [],
): boolean {
  const resultIds = new Set(reconciliation.sceneResults?.map((result) => result.id));
  return (
    reconciliation.fallbacks.length > 0 ||
    (reconciliation.sceneResults ?? []).some((scene) => scene.status !== 'rendered') ||
    ROWS.some(([, key]) => {
      const count = reconciliation[key];
      return count && (count.dropped > 0 || count.rendered < count.planned);
    }) ||
    (reconciliation.scenes?.planned ?? 0) > (reconciliation.sceneResults?.length ?? 0) ||
    scenes.some((scene) => !resultIds.has(scene.id))
  );
}

export function CutPlanReconciliation({
  reconciliation,
  compact = false,
  scenes = [],
  onReviewScene,
  reviewDisabled = false,
  reviewableSceneIds,
}: CutPlanReconciliationProps): React.JSX.Element {
  const savedResults = reconciliation.sceneResults ?? [];
  const resultIds = new Set(savedResults.map((scene) => scene.id));
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const reviewableIds = reviewableSceneIds === undefined ? undefined : new Set(reviewableSceneIds);
  const sceneResults: (Omit<LongformSceneRenderResult, 'status'> & {
    status: LongformSceneRenderResult['status'] | 'incomplete';
  })[] = [
    ...savedResults,
    ...scenes
      .filter((scene) => !resultIds.has(scene.id))
      .map((scene) => ({
        ...scene,
        status: 'incomplete' as const,
        reason: 'No saved export result for this scene in the current plan.',
      })),
  ].sort((a, b) => a.startTime - b.startTime);
  const clean = !hasReconciliationChanges(reconciliation, scenes);
  const needsReview = sceneResults.filter((scene) => scene.status !== 'rendered');

  const openOutput = async (reveal: boolean): Promise<void> => {
    try {
      if (reveal) await window.api.showItemInFolder(reconciliation.outputPath);
      else {
        const error = await window.api.openPath(reconciliation.outputPath);
        if (error) toast.error(`Couldn't open video: ${error}`);
      }
    } catch {
      toast.error("Couldn't open the exported file. It may have moved.");
    }
  };
  return (
    <Card className={compact ? 'p-4' : 'p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {clean ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            )}
            <h2 className="text-sm font-semibold">Export check</h2>
          </div>
          <p role="status" className="mt-2 text-lg font-semibold">
            {clean ? 'Completed as planned' : 'Completed with changes'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {clean
              ? 'Every approved visual beat rendered as planned.'
              : 'The video file is usable. Review changed explanations below.'}
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {new Date(reconciliation.renderedAt).toLocaleString()}
        </span>
      </div>

      <fieldset
        className="mt-4 flex min-w-0 flex-wrap items-center gap-2"
        aria-label="Exported video actions"
      >
        <Button type="button" size="sm" onClick={() => void openOutput(false)}>
          <FileVideo2 aria-hidden /> Open video
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void openOutput(true)}>
          <FolderOpen aria-hidden /> Show file
        </Button>
      </fieldset>

      {needsReview.length > 0 && (
        <section className="mt-5 border-t border-border pt-4" aria-label="Needs review">
          <h3 className="text-sm font-semibold">Needs review</h3>
          <ul className="mt-2 divide-y divide-border">
            {needsReview.map((scene) => {
              const unavailable = reviewableIds !== undefined && !reviewableIds.has(scene.id);
              return (
                <li
                  key={scene.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  data-scene-id={scene.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {scenesById.get(scene.id)?.label?.trim() || humanizeLongformKind(scene.kind)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTimecode(scene.startTime)}–{formatTimecode(scene.endTime)} ·{' '}
                      <span className="text-warning">
                        {scene.status === 'incomplete'
                          ? 'Not confirmed'
                          : humanizeLongformKind(scene.status)}
                      </span>
                    </p>
                  </div>
                  {onReviewScene && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reviewDisabled || unavailable}
                      title={
                        unavailable
                          ? 'This scene or its source is no longer available for review.'
                          : reviewDisabled
                            ? 'Finish or stop active work before reviewing.'
                            : undefined
                      }
                      onClick={() => onReviewScene(scene.id)}
                      aria-label={`Review ${humanizeLongformKind(scene.kind)} at ${formatTimecode(scene.startTime)}`}
                    >
                      Review scene
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            The source video remains where explanations did not render. Reviewing does not change
            the existing file. If you make changes, approve the plan and export the whole video
            again.
          </p>
          {reviewDisabled && onReviewScene && (
            <p className="mt-2 text-xs text-muted-foreground">
              Finish or stop active work before reviewing scenes.
            </p>
          )}
        </section>
      )}

      <details className="mt-5 border-t border-border pt-3">
        <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Export details
        </summary>
        <p className="mt-3 break-all text-xs text-muted-foreground">
          Video file: {reconciliation.outputPath}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <caption className="sr-only">
              Approved Cut Plan counts compared with rendered output
            </caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 font-medium">Visuals</th>
                <th className="pb-2 text-right font-medium">Planned</th>
                <th className="pb-2 text-right font-medium">Eligible</th>
                <th className="pb-2 text-right font-medium">Rendered</th>
                <th className="pb-2 text-right font-medium">Changed</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, key]) => {
                const count = reconciliation[key];
                if (!count || (reconciliation.scenes && key !== 'scenes' && count.planned === 0))
                  return null;
                return (
                  <tr key={key} className="border-b border-border/70 last:border-0">
                    <th scope="row" className="py-2.5 pr-2 font-medium text-foreground">
                      {label}
                    </th>
                    <td className="py-2.5 text-right tabular-nums">{count.planned}</td>
                    <td className="py-2.5 text-right tabular-nums">{count.eligible}</td>
                    <td className="py-2.5 text-right tabular-nums text-success">
                      {count.rendered}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {Math.max(count.dropped, count.planned - count.rendered) || 'None'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sceneResults.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="text-xs font-semibold">Scene render results</h3>
            <ul className="mt-2 space-y-3">
              {sceneResults.map((scene) => (
                <li key={scene.id} className="text-xs">
                  <p className="font-medium">
                    {humanizeLongformKind(scene.kind)} ·{' '}
                    {scene.status === 'incomplete'
                      ? 'Not confirmed'
                      : humanizeLongformKind(scene.status)}
                  </p>
                  <p className="mt-1 break-words text-muted-foreground">
                    {scene.id} · {formatTimecode(scene.startTime)}–{formatTimecode(scene.endTime)}
                  </p>
                  {scene.reason && <p className="mt-1 text-muted-foreground">{scene.reason}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reconciliation.fallbacks.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="text-xs font-semibold">Changed or missing visuals</h3>
            <ul className="mt-2 space-y-2">
              {reconciliation.fallbacks.map((fallback) => (
                <li
                  key={`${fallback.type}-${fallback.label ?? ''}-${fallback.reason}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-xs"
                >
                  <span className="rounded border border-warning/35 bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                    {fallback.count} {humanizeLongformKind(fallback.type)}
                  </span>
                  <span className="leading-relaxed text-muted-foreground">
                    {fallback.label ? `${fallback.label}: ` : ''}
                    {fallback.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </Card>
  );
}
