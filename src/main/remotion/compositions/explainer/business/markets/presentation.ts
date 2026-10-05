import { businessLabelLines, businessTextWidth } from '../text-width';
import type { BusinessIdentity } from '../types';
import { MARKETS_LIMITS, type MarketFact, type MarketsScene, type ProcurementRole } from './types';

export const MARKETS_RAIL = Object.freeze({
  x: 64,
  y: 282,
  width: 952,
  height: 478,
  fontSize: 24,
  lineHeight: 29,
  bodyLines: 10,
  detailHold: 1.5,
  finalHold: 0.8,
  maxPages: 4,
});
export interface MarketsRow {
  id: string;
  label: string;
  text: string;
  state: string;
}
export interface MarketsPage {
  rows: readonly MarketsRow[];
  lines: number;
}
export const PROCUREMENT_ROLES: readonly ProcurementRole[] = [
  'requester',
  'delegate',
  'approver',
  'payee',
];

/** Bundled Inter Regular/Bold advances, with the shared 4% safety allowance. */
export function marketsTextWidth(text: string): number {
  return businessTextWidth(text, MARKETS_RAIL.fontSize);
}
/** Lossless fixed-font pixel wrapping inside the unchanged 24px left/right padding.
 * An over-wide token remains intact so validation rejects it rather than splitting a source name.
 */
export function marketsLines(text: string): string[] {
  const width = MARKETS_RAIL.width - 48;
  if (text.split(/\s+/u).some((word) => marketsTextWidth(word) > width))
    return [text.trim().replace(/\s+/gu, ' ')];
  return businessLabelLines(text, width, MARKETS_RAIL.fontSize);
}
export function marketsIdentities(scene: MarketsScene): readonly BusinessIdentity[] {
  if (scene.kind === 'procurement-commitment')
    return [...scene.actors, scene.task, scene.item, scene.quote.identity, scene.payment.identity];
  const business = scene.business;
  switch (scene.preset) {
    case 'channel-concentration':
      return [business, ...scene.customerGroups, ...scene.channels.map((c) => c.identity)];
    case 'demand-access':
      return [business, scene.offering, scene.demand, scene.channel];
    case 'migration-constraints':
      return [
        business,
        scene.fromProvider,
        scene.toProvider,
        scene.migration.identity,
        ...scene.constraints.map((c) => c.identity),
      ];
    case 'participation-matching':
      return [business, ...scene.participants.map((p) => p.identity)];
    case 'stated-participation-benefit':
      return [business, ...scene.participants];
    case 'differentiated-offering':
      return [business, scene.comparisonSubject, ...scene.offerings.map((o) => o.identity)];
    case 'supplier-distribution-boundaries':
      return [business, scene.supplier, scene.item, scene.channel];
    case 'complementary-specialists':
      return [business, ...scene.specialists.flatMap((s) => [s.identity, s.capability.identity])];
  }
}
export function marketsRows(scene: MarketsScene): MarketsRow[] {
  const rows: MarketsRow[] = [
    {
      id: 'identities',
      label: 'Source identities',
      state: 'source-stated',
      text: marketsIdentities(scene)
        .map((i) => i.label)
        .join(' · '),
    },
  ];
  const add = (id: string, label: string, fact: MarketFact<string>) =>
    rows.push({ id, label, state: fact.state, text: fact.text });
  if (scene.kind === 'procurement-commitment') {
    for (const role of PROCUREMENT_ROLES)
      rows.push({
        id: `role-${role}`,
        label: role,
        state: scene.roles[role].actorId === null ? 'unknown' : 'source-stated',
        text: scene.roles[role].text,
      });
    add('request', 'Request', scene.request);
    add('quote', 'Quote', scene.quote);
    add('authority', 'Authorization', scene.authority);
    add('acceptance', 'Acceptance', scene.acceptance);
    add('payment', 'Payment', scene.payment);
  } else
    switch (scene.preset) {
      case 'channel-concentration':
        for (const c of scene.channels) {
          add(`dependency-${c.identity.id}`, 'Channel / customer dependency', c.dependency);
          add(`volume-${c.identity.id}`, 'Distribution volume', c.volume);
        }
        break;
      case 'demand-access':
        add('production', 'Production', scene.production);
        add('demand', 'Demand', scene.demandFact);
        add('access', 'Distribution access', scene.access);
        break;
      case 'migration-constraints':
        add('migration', 'Migration', scene.migration);
        for (const c of scene.constraints) add(`constraint-${c.identity.id}`, c.identity.label, c);
        break;
      case 'participation-matching':
      case 'stated-participation-benefit':
        if (scene.preset === 'participation-matching')
          for (const p of scene.participants)
            add(`side-${p.identity.id}`, `${p.side} side`, p.role);
        for (const p of scene.participations)
          add(`participation-${p.participantId}`, 'Participation', p);
        if (scene.preset === 'participation-matching')
          for (const m of scene.matches) {
            add(`match-${m.leftId}-${m.rightId}`, 'Matching', m);
            add(`acceptance-${m.leftId}-${m.rightId}`, 'Acceptance', m.acceptance);
          }
        else add('benefit', 'Source-stated conditional benefit', scene.benefit);
        break;
      case 'differentiated-offering':
        add('baseline', 'Shared subject / baseline', scene.baseline);
        for (const o of scene.offerings)
          add(`offering-${o.identity.id}`, 'Equal-baseline alternative', o.differentiation);
        break;
      case 'supplier-distribution-boundaries':
        add('supply', 'Supplier fact', scene.supply);
        add('distribution', 'Distribution fact', scene.distribution);
        break;
      case 'complementary-specialists':
        for (const s of scene.specialists)
          add(`capability-${s.identity.id}`, 'Named capability', s.capability);
        for (const p of scene.pairs)
          add(`pair-${p.leftId}-${p.rightId}`, 'Stated complementary relationship', p);
        break;
    }
  return rows;
}
export function marketsPages(scene: MarketsScene): MarketsPage[] {
  const pages: MarketsPage[] = [];
  let rows: MarketsRow[] = [],
    lines = 0;
  for (const row of marketsRows(scene)) {
    const needed =
      marketsLines(`${row.label} · ${row.state}`).length + marketsLines(row.text).length;
    if (rows.length && lines + needed > MARKETS_RAIL.bodyLines) {
      pages.push({ rows, lines });
      rows = [];
      lines = 0;
    }
    rows.push(row);
    lines += needed;
  }
  if (rows.length) pages.push({ rows, lines });
  return pages;
}
export function marketsReadingStart(scene: MarketsScene): number {
  // Exactly diagramPose's response handoff and setup ramps, not an assumed page clock.
  const handoffEnd = scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
  return Math.max(
    scene.setupAt + 0.35,
    scene.visualMode === 'hybrid' ? handoffEnd : scene.setupAt + 0.35,
  );
}
export function marketsDetailWindows(
  scene: MarketsScene,
): readonly { start: number; end: number }[] {
  const count = marketsPages(scene).length;
  const start = marketsReadingStart(scene);
  const duration = (scene.resolveAt - start) / count;
  return Array.from({ length: count }, (_, i) => ({
    start: start + duration * i,
    end: start + duration * (i + 1),
  }));
}
export function marketsPageIndex(scene: MarketsScene, t: number): number {
  const windows = marketsDetailWindows(scene);
  if (!Number.isFinite(t) || t < windows[0].start) return 0;
  return Math.min(
    windows.length - 1,
    Math.max(0, Math.floor((t - windows[0].start) / (windows[0].end - windows[0].start))),
  );
}
export function marketsContentFits(scene: MarketsScene): boolean {
  const ids = marketsIdentities(scene);
  const facts = marketsRows(scene).filter((row) => row.id !== 'identities');
  const nullMoney =
    scene.kind === 'procurement-commitment'
      ? Number(scene.quote.amount === null) + Number(scene.payment.amount === null)
      : 0;
  const holds =
    facts.filter((f) => ['pending', 'unmet', 'unknown', 'conditional'].includes(f.state)).length +
    nullMoney +
    Number(scene.factEvidence.state === 'unknown' || scene.factEvidence.state === 'scenario');
  return (
    ids.length <= MARKETS_LIMITS.entities &&
    facts.length <= MARKETS_LIMITS.edges &&
    holds <= MARKETS_LIMITS.holds &&
    new Set(ids.map((i) => i.id)).size === ids.length
  );
}
export function marketsPresentationFits(scene: MarketsScene, endTime?: number): boolean {
  const pages = marketsPages(scene);
  const texts = [
    scene.label,
    scene.outcome,
    scene.factEvidence.label,
    scene.condition ?? '',
    ...marketsRows(scene).flatMap((r) => [r.label, r.state, r.text]),
  ];
  return (
    (endTime === undefined ||
      (Number.isFinite(endTime) && endTime - scene.resolveAt >= MARKETS_RAIL.finalHold - 1e-8)) &&
    pages.length <= MARKETS_RAIL.maxPages &&
    pages.every((p) => p.lines <= MARKETS_RAIL.bodyLines) &&
    texts.every((text) =>
      marketsLines(text).every((line) => marketsTextWidth(line) <= MARKETS_RAIL.width - 48),
    ) &&
    marketsLines(scene.factEvidence.label).length <= 1 &&
    marketsLines(scene.condition ?? '').length <= 2 &&
    marketsDetailWindows(scene).every(
      (w) =>
        Number.isFinite(w.start) &&
        Number.isFinite(w.end) &&
        w.end - w.start >= MARKETS_RAIL.detailHold - 1e-8,
    )
  );
}
