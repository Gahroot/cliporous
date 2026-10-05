import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount } from '../value-types';
import type { ExpansionGeneralizationDriftScene } from './generalization-drift-types';

export const GENERALIZATION_DRIFT_DETAIL = {
  columns: 18,
  lines: 8,
  font: 22,
  leading: 28,
} as const;
/** Character-preserving wrap: no trimming, ellipsis, normalization or shrinking. */
export function generalizationDriftWrap(text: string): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / 18)) }, (_, i) =>
    chars.slice(i * 18, (i + 1) * 18).join(''),
  );
}
export function generalizationDriftAmount(a: ExpansionAmount): string[] {
  return [
    ...(a.notation === undefined ? [] : [`Source: ${a.notation}`]),
    a.kind === 'rational'
      ? `Exact: ${a.value.numerator}/${a.value.denominator}`
      : `Exact: ${a.value.minorUnits} minor units ${a.value.currency}`,
  ];
}
export interface GeneralizationDriftPage {
  readonly category: string;
  readonly lanes: readonly [readonly string[], readonly string[]];
}
/** Aligned small multiples retain identity, attribution and exact basis; never rank outcomes. */
export function generalizationDriftFields(
  scene: ExpansionGeneralizationDriftScene,
): { category: string; lanes: [string[], string[]] }[] {
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const pair = (
    f: (r: ExpansionGeneralizationDriftScene['records'][number]) => string[],
  ): [string[], string[]] => [f(scene.records[0]), f(scene.records[1])];
  return [
    {
      category: 'Source context',
      lanes: pair(() => [
        scene.label,
        scene.subject,
        scene.evidence,
        `Scope: ${scene.scope}`,
        `Period: ${scene.period}`,
        `Metric: ${scene.metric}`,
        `Outcome: ${scene.outcome}`,
      ]),
    },
    {
      category: 'Example split',
      lanes: pair((r) => [
        `Actor: ${name(scene.actorId)}`,
        `Dataset: ${name(r.datasetId)}`,
        `Sample: ${r.sample}`,
        `Role: ${r.role}`,
      ]),
    },
    {
      category: 'Evaluation scope',
      lanes: pair((r) => [
        `Condition: ${r.condition}`,
        `Population: ${r.population}`,
        `Period: ${scene.period}`,
      ]),
    },
    {
      category: 'Supplied results',
      lanes: pair((r) => [
        r.result.state,
        ...('condition' in r.result ? [r.result.condition] : []),
        ...('qualifier' in r.result ? [r.result.qualifier] : []),
        ...('amount' in r.result
          ? generalizationDriftAmount(r.result.amount)
          : r.result.state === 'disputed'
            ? r.result.alternatives.flatMap(generalizationDriftAmount)
            : []),
      ]),
    },
    {
      category: 'Comparable basis',
      lanes: pair((r) => [
        `Unit: ${r.result.basis.unit}`,
        `Denominator: ${r.result.basis.denominator?.numerator}/${r.result.basis.denominator?.denominator}`,
        `Period: ${r.result.basis.period}`,
        `Population: ${r.result.basis.population}`,
      ]),
    },
    {
      category: 'Result attribution',
      lanes: pair((r) => [
        `Actor: ${r.result.actor}`,
        `Claim: ${r.result.claim}`,
        ...scene.relations
          .filter((link) => link.toId === r.datasetId)
          .flatMap((link) => [
            name(link.fromId),
            link.role,
            name(link.toId),
            ...(link.condition ? [link.condition] : []),
          ]),
      ]),
    },
  ];
}
export function generalizationDriftPages(
  scene: ExpansionGeneralizationDriftScene,
): GeneralizationDriftPage[] {
  return generalizationDriftFields(scene).flatMap(({ category, lanes }) => {
    const lines = lanes.map((lane) => lane.flatMap(generalizationDriftWrap));
    return Array.from(
      {
        length: Math.ceil(
          Math.max(...lines.map((lane) => lane.length)) / GENERALIZATION_DRIFT_DETAIL.lines,
        ),
      },
      (_, page) => ({
        category,
        lanes: [
          lines[0].slice(
            page * GENERALIZATION_DRIFT_DETAIL.lines,
            (page + 1) * GENERALIZATION_DRIFT_DETAIL.lines,
          ),
          lines[1].slice(
            page * GENERALIZATION_DRIFT_DETAIL.lines,
            (page + 1) * GENERALIZATION_DRIFT_DETAIL.lines,
          ),
        ] as const,
      }),
    );
  });
}
export interface GeneralizationDriftPose extends ExpansionKitPose {
  readonly pages: readonly GeneralizationDriftPage[];
  readonly page: number;
}
export function generalizationDriftPose(
  scene: ExpansionGeneralizationDriftScene,
  time: number,
): GeneralizationDriftPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = generalizationDriftPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
