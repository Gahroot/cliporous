import { diagramPose } from '../../diagrams/motion';
import type { DiagramStory } from '../../diagrams/types';
import type { FinanceActor } from '../../finance/types';
import { businessLabelLines, businessTextWidth } from '../text-width';
import type { BusinessWordSpan } from '../types';
import type { CapitalDependencyLens } from './dependency-types';

export const CAPITAL_DEPENDENCY_READING = {
  width: 952,
  height: 478,
  x: 24,
  rail: 904,
  titleFont: 24,
  bodyFont: 22,
  titleLineHeight: 30,
  lineHeight: 27,
  gap: 12,
  pageHold: 1.5,
} as const;

export interface CapitalDependencyFact {
  id: string;
  kind: 'holding' | 'dependency' | 'records' | 'scope';
  text: string;
  entityIds: string[];
  fromId: string | null;
  toId: string | null;
  source: BusinessWordSpan | null;
}
export interface CapitalDependencyFactLayout {
  fact: CapitalDependencyFact;
  lines: string[];
  top: number;
  height: number;
}
export interface CapitalDependencyPage {
  id: string;
  start: number;
  end: number;
  titleLines: string[];
  facts: CapitalDependencyFactLayout[];
}

export function capitalDependencySemanticIds(
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  lens: CapitalDependencyLens,
): string[] {
  return [
    ...funds.map((fund) => fund.id),
    ...lens.firms.map((firm) => firm.identity.id),
    exposure.id,
  ];
}

/** Literal qualitative edges and independently supported record meaning; no computed finance. */
export function capitalDependencyFacts(
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  lens: CapitalDependencyLens,
): CapitalDependencyFact[] {
  const holdings: CapitalDependencyFact[] = [];
  const dependencies: CapitalDependencyFact[] = [];
  for (const fund of funds) {
    const firm = lens.firms.find((entry) => entry.fundId === fund.id);
    if (!firm) throw new Error('Dependency lens lacks its source-held firm');
    holdings.push({
      id: `${fund.id}:holds:${firm.identity.id}`,
      kind: 'holding',
      text: `Fund ${fund.label} holds firm ${firm.identity.label}.`,
      entityIds: [fund.id, firm.identity.id],
      fromId: fund.id,
      toId: firm.identity.id,
      source: { ...firm.holdingSource },
    });
    dependencies.push({
      id: `${firm.identity.id}:depends:${exposure.id}`,
      kind: 'dependency',
      text: `Firm ${firm.identity.label} depends on common driver ${exposure.label}.`,
      entityIds: [firm.identity.id, exposure.id],
      fromId: firm.identity.id,
      toId: exposure.id,
      source: { ...firm.driverSource },
    });
  }
  return [
    ...holdings,
    ...dependencies,
    {
      id: 'records',
      kind: 'records',
      text: `${funds.map((fund) => fund.label).join(' and ')} maintain asset ownership and economic claim records.`,
      entityIds: funds.map((fund) => fund.id),
      fromId: null,
      toId: null,
      source: { ...lens.modelSource },
    },
    {
      id: 'scope',
      kind: 'scope',
      text: 'Qualitative dependency; no correlation, risk, numeric weights or payout inferred. Record separation is inspection only, not money or rights movement. Other exposures: not represented in this lens.',
      entityIds: capitalDependencySemanticIds(funds, exposure, lens),
      fromId: null,
      toId: null,
      source: null,
    },
  ];
}

/** Same conservative clock in both modes, after the existing response handoff is fully opaque. */
export function capitalDependencyReadingStart(scene: DiagramStory): number {
  return scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
}

function pageLayouts(
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  lens: CapitalDependencyLens,
): Pick<CapitalDependencyPage, 'id' | 'titleLines' | 'facts'>[] {
  const R = CAPITAL_DEPENDENCY_READING;
  const titleLines = businessLabelLines(`Common driver: ${exposure.label}`, R.rail, R.titleFont);
  const top = R.x + titleLines.length * R.titleLineHeight + R.gap;
  const bottom = R.height - R.x;
  if (!titleLines.length || top >= bottom) throw new Error('Dependency title exceeds its rail');
  const pages: Pick<CapitalDependencyPage, 'id' | 'titleLines' | 'facts'>[] = [];
  let facts: CapitalDependencyFactLayout[] = [];
  let cursor = top;
  function finish() {
    pages.push({
      id: facts.map((layout) => layout.fact.id).join('|'),
      titleLines: [...titleLines],
      facts,
    });
    facts = [];
    cursor = top;
  }
  for (const fact of capitalDependencyFacts(funds, exposure, lens)) {
    const lines = businessLabelLines(fact.text, R.rail, R.bodyFont);
    const height = lines.length * R.lineHeight + R.gap;
    if (!lines.length || height > bottom - top)
      throw new Error('A complete dependency fact exceeds its fixed-font rail');
    if (cursor + height > bottom) finish();
    facts.push({ fact, lines, top: cursor, height });
    cursor += height;
  }
  if (facts.length) finish();
  return pages;
}

/** React-free parser gate: reject density, never shrink, truncate or borrow an unsettled handoff. */
export function capitalDependencyReadingFits(
  scene: DiagramStory,
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  lens: CapitalDependencyLens,
): boolean {
  const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
  if (
    !beats.every(Number.isFinite) ||
    beats.some((beat, index) => index > 0 && beat <= beats[index - 1]) ||
    !Number.isFinite(lens.finalHoldSeconds) ||
    lens.finalHoldSeconds < 0.8 ||
    lens.version !== 1 ||
    funds.length !== 2 ||
    lens.firms.length !== 2 ||
    new Set(capitalDependencySemanticIds(funds, exposure, lens)).size !== 5 ||
    new Set(lens.firms.map((firm) => firm.fundId)).size !== 2
  )
    return false;
  try {
    const R = CAPITAL_DEPENDENCY_READING;
    const pages = pageLayouts(funds, exposure, lens);
    const ready = capitalDependencyReadingStart(scene);
    return (
      pages.length > 0 &&
      pages.length <= 4 &&
      diagramPose(ready, scene).diagramOpacity >= 1 - 1e-7 &&
      scene.resolveAt - ready >= pages.length * R.pageHold &&
      pages.every(
        (page) =>
          page.titleLines.every((text) => businessTextWidth(text, R.titleFont) <= R.rail) &&
          page.facts.every(
            (layout) =>
              layout.lines.every((text) => businessTextWidth(text, R.bodyFont) <= R.rail) &&
              layout.top + layout.height <= R.height - R.x,
          ),
      )
    );
  } catch {
    return false;
  }
}

export function capitalDependencyPages(
  scene: DiagramStory,
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  lens: CapitalDependencyLens,
): CapitalDependencyPage[] {
  if (!capitalDependencyReadingFits(scene, funds, exposure, lens))
    throw new Error('Dependency lens exceeds complete fixed-font reading budget');
  const pages = pageLayouts(funds, exposure, lens);
  const ready = capitalDependencyReadingStart(scene);
  const duration = (scene.resolveAt - ready) / pages.length;
  return pages.map((page, index) => ({
    ...page,
    start: ready + index * duration,
    end:
      index === pages.length - 1
        ? scene.resolveAt + lens.finalHoldSeconds
        : ready + (index + 1) * duration,
  }));
}

export function capitalDependencyPageAt(
  scene: DiagramStory,
  funds: readonly FinanceActor[],
  exposure: FinanceActor,
  lens: CapitalDependencyLens,
  seconds: number,
): CapitalDependencyPage {
  const pages = capitalDependencyPages(scene, funds, exposure, lens);
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt;
  return pages.find((page) => t < page.end) ?? pages[pages.length - 1];
}
