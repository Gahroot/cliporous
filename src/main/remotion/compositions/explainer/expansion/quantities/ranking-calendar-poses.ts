import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import { rationalPosition } from '../value-logic';
import type { ExpansionQuantity } from '../value-types';
import type {
  ExpansionRankChangeScene,
  ExpansionRankingCalendarScene,
  ExpansionRankRecord,
} from './ranking-calendar-types';

export const RANKING_CALENDAR_DETAIL = {
  x: 500,
  y: 38,
  width: 440,
  font: 22,
  lineHeight: 28,
  columns: 18,
  rows: 13,
};
export interface RankingCalendarPage {
  readonly id: string;
  readonly record: number;
  readonly lines: readonly string[];
  readonly lineIds: readonly string[];
}
export interface RankingCalendarPose extends ExpansionKitPose {
  readonly turn: number;
  readonly page: number;
  readonly record: number;
  readonly pages: readonly RankingCalendarPage[];
}
/** Author order is deliberately independent of the numerical rank. */
export function rankingCalendarRecords(scene: ExpansionRankingCalendarScene) {
  return scene.storyId === '21' ? scene.states.flatMap((s) => s.records) : scene.records;
}
/** A shared source-rank axis; author order determines only separate horizontal identity lanes. */
export function rankingRankDomain(scene: ExpansionRankChangeScene): readonly number[] {
  const ranks = scene.states.flatMap((s) =>
    s.records.flatMap((r) => (r.rank === undefined ? [] : [r.rank])),
  );
  return ranks.length ? [Math.min(...ranks), Math.max(...ranks)] : [];
}
export function rankingRankTracks(scene: ExpansionRankChangeScene) {
  const domain = rankingRankDomain(scene);
  return scene.entities.map((entity, index) => ({
    actorId: entity.id,
    points: scene.states.map((s, state) => {
      const record = s.records.find((r) => r.actorId === entity.id);
      if (!record) throw new Error('Rank identity lost');
      let y = 354; // Separate absence lane: NEVER rank zero or an inferred placement.
      if (record.rank !== undefined) {
        if (domain[0] === domain[1]) y = 210;
        else {
          const p = rationalPosition(
            { numerator: record.rank, denominator: 1 },
            { numerator: domain[0], denominator: 1 },
            { numerator: domain[1], denominator: 1 },
          );
          if (!p.ok) throw new Error('Invalid supplied rank domain');
          y = 100 + p.value * 220;
        }
      }
      return {
        record,
        x: 170 + state * 160 + index * 12,
        y,
        tied:
          record.rank !== undefined && s.records.filter((r) => r.rank === record.rank).length > 1,
      };
    }),
  }));
}
export function rankStatus(
  record: ExpansionRankRecord,
  peers: readonly ExpansionRankRecord[],
): string {
  if (record.unrankedEvidence) return `unranked; ${record.quantity.state}`;
  if (record.rank === undefined) return record.quantity.state;
  return `${peers.filter((p) => p.rank === record.rank).length > 1 ? 'tied' : 'supplied'} rank ${record.rank}; ${record.quantity.state}`;
}
export function rankingCalendarQuantityFields(q: ExpansionQuantity): string[] {
  return [
    q.actor,
    q.claim,
    `State: ${q.state}`,
    plottedValueText(q),
    `Unit: ${q.basis.unit}`,
    `Population: ${q.basis.population}`,
    `Period: ${q.basis.period}`,
    ...(q.basis.denominator
      ? [`Denominator: ${q.basis.denominator.numerator}/${q.basis.denominator.denominator}`]
      : []),
    ...('condition' in q ? [q.condition] : 'qualifier' in q ? [q.qualifier] : []),
  ];
}
export function rankingCalendarFields(
  scene: ExpansionRankingCalendarScene,
  index: number,
): string[] {
  const records = rankingCalendarRecords(scene);
  const r = records[index];
  const common = [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.evidence,
    ...(scene.condition ? [scene.condition] : []),
  ];
  if (scene.storyId === '21') {
    const state = scene.states.find((s) => s.records.some((v) => v.id === r.id));
    if (!state) throw new Error('Missing supplied state');
    const record = state.records.find((v) => v.id === r.id);
    if (!record) throw new Error('Missing supplied rank');
    return [
      ...common,
      `Option ${scene.entities.findIndex((e) => e.id === r.actorId) + 1}`,
      `Criterion: ${scene.criterion}`,
      ...scene.states.map((s) => `State period: ${s.period}`),
      rankStatus(record, state.records),
      ...rankingCalendarQuantityFields(r.quantity),
      'Comparison: supplied states',
      ...(scene.comparison.condition ? [scene.comparison.condition] : []),
      'Result: scoped',
      ...(scene.result.condition ? [scene.result.condition] : []),
    ];
  }
  const calendar = scene.records[index];
  return [
    ...common,
    calendar.label,
    `Calendar year: ${calendar.calendar.year}`,
    `Calendar month: ${calendar.calendar.month}`,
    ...rankingCalendarQuantityFields(r.quantity),
    ...scene.relations
      .filter((v) => v.fromId === r.id || v.toId === r.id)
      .flatMap((v) => {
        const from = scene.records.find((item) => item.id === v.fromId);
        const to = scene.records.find((item) => item.id === v.toId);
        return [
          `Relation: ${v.role}`,
          `From: ${from?.quantity.actor} ${from?.quantity.basis.period}`,
          `To: ${to?.quantity.actor} ${to?.quantity.basis.period}`,
          ...(v.condition ? [v.condition] : []),
        ];
      }),
    'Result: scoped',
    ...(scene.result.condition ? [scene.result.condition] : []),
  ];
}
/** Full source strings are split, never shortened, scaled or ellipsized. */
export function rankingCalendarPages(scene: ExpansionRankingCalendarScene): RankingCalendarPage[] {
  return rankingCalendarRecords(scene).flatMap((r, record) => {
    const lines = rankingCalendarFields(scene, record).flatMap((field) => {
      const chars = Array.from(field);
      return Array.from(
        { length: Math.max(1, Math.ceil(chars.length / RANKING_CALENDAR_DETAIL.columns)) },
        (_, i) =>
          chars
            .slice(i * RANKING_CALENDAR_DETAIL.columns, (i + 1) * RANKING_CALENDAR_DETAIL.columns)
            .join(''),
      );
    });
    return Array.from(
      { length: Math.ceil(lines.length / RANKING_CALENDAR_DETAIL.rows) },
      (_, page) => {
        const start = page * RANKING_CALENDAR_DETAIL.rows;
        return {
          id: r.id,
          record,
          lines: lines.slice(start, start + RANKING_CALENDAR_DETAIL.rows),
          lineIds: lines
            .slice(start, start + RANKING_CALENDAR_DETAIL.rows)
            .map((_, i) => `${r.id}:line:${start + i}`),
        };
      },
    );
  });
}
/** One deterministic lens through the full five-beat window; resolve retains the final page. */
export function rankingCalendarPose(
  scene: ExpansionRankingCalendarScene,
  t: number,
): RankingCalendarPose {
  const p = diagramPose(t, scene);
  const pages = rankingCalendarPages(scene);
  const progress = Number.isFinite(t)
    ? Math.max(
        0,
        Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
      )
    : 0;
  const page = Math.min(pages.length - 1, Math.floor(progress * pages.length));
  return {
    turn: p.modelTurn,
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    page,
    pages,
    record: pages[page].record,
  };
}
