import { diagramPose } from '../../diagrams/motion';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionAmount, ExpansionQuantity } from '../value-types';
import type {
  ExpansionSupplyIncentivesScene,
  SupplyIncentivesRecord,
} from './supply-incentives-types';

export const SUPPLY_INCENTIVES_DETAIL = {
  x: 500,
  y: 246,
  columns: 18,
  lines: 6,
  leading: 28,
  font: 22,
} as const;
/** Character runs preserve every source character, including whitespace. */
export function supplyIncentivesWrap(text: string, columns = 18): string[] {
  const chars = Array.from(text);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function supplyIncentivesAmount(a: ExpansionAmount): string {
  const exact =
    a.kind === 'money'
      ? `${a.value.minorUnits} minor units ${a.value.currency}`
      : `${a.value.numerator}/${a.value.denominator}`;
  return a.notation === undefined ? exact : `${a.notation} = ${exact}`;
}
export function supplyIncentivesQuantity(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    q.state,
    ...('condition' in q ? [q.condition] : []),
    ...('qualifier' in q ? [q.qualifier] : []),
    ...('amount' in q
      ? [supplyIncentivesAmount(q.amount)]
      : q.state === 'disputed'
        ? q.alternatives.map(supplyIncentivesAmount)
        : []),
    `Unit: ${q.basis.unit}`,
    `Period: ${q.basis.period}`,
    `Population: ${q.basis.population}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
  ];
}
export interface SupplyIncentivesPage {
  readonly id: string;
  readonly recordIds: readonly string[];
  readonly fields: readonly string[];
  readonly lines: readonly string[];
  readonly lineIds: readonly string[];
  readonly state?: string;
  readonly qualification: readonly string[];
  readonly quantityState?: ExpansionQuantity['state'];
  readonly quantityIndex?: number;
}
export function supplyIncentivesPages(
  scene: ExpansionSupplyIncentivesScene,
): SupplyIncentivesPage[] {
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const lenses: Array<{
    id: string;
    recordIds: string[];
    fields: string[];
    state?: string;
    qualification?: string;
    quantityState?: ExpansionQuantity['state'];
    quantityIndex?: number;
  }> = [
    {
      id: `${scene.storyId}:context`,
      recordIds: [scene.records[0].id],
      state: scene.records[0].state,
      qualification: scene.records[0].condition ?? scene.records[0].qualifier,
      fields: [
        scene.label,
        scene.subject,
        scene.evidence,
        scene.records[0].scope,
        scene.records[0].period,
        ...(scene.condition ? [scene.condition] : []),
      ],
    },
    ...scene.records.map((r) => ({
      id: r.id,
      recordIds: [r.id],
      state: r.state,
      qualification: r.condition ?? r.qualifier,
      fields: [
        name(r.actorId),
        name(r.targetId),
        r.role,
        r.claim,
        r.value,
        r.state,
        r.scope,
        r.period,
        ...(r.condition ? [r.condition] : []),
        ...(r.qualifier ? [r.qualifier] : []),
        r.stage,
      ],
    })),
    ...scene.relations.map((r) => ({
      id: r.id,
      recordIds: scene.records
        .filter((record) => record.evidence.fromWord === r.evidence.fromWord)
        .map((record) => record.id),
      state: r.state,
      qualification: r.condition ?? r.qualifier,
      fields: [
        name(r.fromId),
        r.role,
        name(r.toId),
        r.state,
        ...(r.condition ? [r.condition] : []),
        ...(r.qualifier ? [r.qualifier] : []),
      ],
    })),
    ...scene.quantities.map((q, i) => ({
      id: `${scene.storyId}:quantity:${i}`,
      recordIds: [],
      state: q.state,
      qualification: 'condition' in q ? q.condition : 'qualifier' in q ? q.qualifier : undefined,
      quantityState: q.state,
      quantityIndex: i,
      fields: supplyIncentivesQuantity(q),
    })),
    {
      id: `${scene.storyId}:outcome`,
      recordIds: [scene.records[4].id],
      state: scene.records[4].state,
      qualification: scene.records[4].condition ?? scene.records[4].qualifier,
      fields: [scene.outcome],
    },
  ];
  return lenses.flatMap((lens) => {
    const record = scene.records.find((r) => r.id === lens.id);
    const state = lens.state ?? record?.state;
    const lines = lens.fields.flatMap((f) => supplyIncentivesWrap(f));
    return Array.from(
      { length: Math.ceil(lines.length / SUPPLY_INCENTIVES_DETAIL.lines) },
      (_, page) => {
        const start = page * SUPPLY_INCENTIVES_DETAIL.lines;
        return {
          ...lens,
          state,
          qualification: lens.qualification ? supplyIncentivesWrap(lens.qualification) : [],
          lines: lines.slice(start, start + SUPPLY_INCENTIVES_DETAIL.lines),
          lineIds: lines
            .slice(start, start + SUPPLY_INCENTIVES_DETAIL.lines)
            .map((_, i) => `${lens.id}:line:${start + i}`),
        };
      },
    );
  });
}
export interface SupplyIncentivesPose extends ExpansionKitPose {
  readonly page: number;
  readonly pages: readonly SupplyIncentivesPage[];
  readonly phase: number;
  readonly travel: number;
}
export function supplyIncentivesPose(
  scene: ExpansionSupplyIncentivesScene,
  time: number,
): SupplyIncentivesPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene),
    pages = supplyIncentivesPages(scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / (scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    travel: -0.8 + 1.6 * progress,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
    phase: [scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt].filter(
      (at) => t >= at,
    ).length,
  };
}

export function supplyIncentivesActiveRecord(
  scene: ExpansionSupplyIncentivesScene,
  pose: SupplyIncentivesPose,
): SupplyIncentivesRecord {
  const page = pose.pages[pose.page];
  return scene.records.find((r) => page.recordIds.includes(r.id)) ?? scene.records[pose.phase];
}
