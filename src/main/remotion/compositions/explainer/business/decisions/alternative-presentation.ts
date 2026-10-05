import type { PossibleFuturesScene } from '../../concepts/perspective/types';
import { diagramPose } from '../../diagrams/motion';
import type { DiagramStory } from '../../diagrams/types';
import { businessLabelLines, businessTextWidth } from '../text-width';
import type { BusinessWordSpan } from '../types';
import type { BusinessAlternativesLens } from './alternative-types';

export const BUSINESS_ALTERNATIVE_READING = {
  width: 952,
  height: 478,
  padding: 16,
  rail: 920,
  titleFont: 24,
  bodyFont: 24,
  titleLineHeight: 28,
  lineHeight: 29,
  gap: 10,
  pageHold: 1.5,
} as const;

export const BUSINESS_ALTERNATIVE_SCOPE =
  'Illustrative records, not actual branches or achieved output. Equal area and time imply no probability or winner; capacity remains qualitative.';

export interface BusinessAlternativeFact {
  id: string;
  kind: 'baseline' | 'evidence' | 'native' | 'scope' | 'context' | 'record' | 'uncertainty';
  text: string;
  entityIds: string[];
  source: BusinessWordSpan | null;
}
export interface BusinessAlternativeLayout {
  fact: BusinessAlternativeFact;
  title: string;
  titleLines: string[];
  lines: { id: string; text: string }[];
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface BusinessAlternativePage {
  id: string;
  start: number;
  end: number;
  titleLines: string[];
  cards: BusinessAlternativeLayout[];
}

/** Adapt only the presentation, never the accepted legacy clocks, condition or final meaning. */
export function businessAlternativeStory(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
): DiagramStory {
  return {
    label: scene.label,
    subject: scene.subject,
    outcome: scene.outcome,
    ...(scene.condition === undefined ? {} : { condition: scene.condition }),
    setupAt: scene.setupAt,
    actionAt: scene.actionAt,
    responseAt: scene.responseAt,
    checkAt: scene.checkAt,
    resolveAt: scene.resolveAt,
    visualMode: lens.visualMode,
    evidence: 'illustrative',
  };
}

export function businessAlternativeSemanticIds(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
): string[] {
  return [
    lens.baseline.subject.id,
    lens.baseline.identity.id,
    ...scene.alternatives.map((alternative) => alternative.id),
    ...lens.records.map((record) => record.identity.id),
  ];
}

export function businessAlternativeFacts(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
): BusinessAlternativeFact[] {
  const b = lens.baseline;
  const context = `${b.subject.label} from actual baseline ${b.identity.label} during ${b.period} at revision ${b.revision}`;
  const ids = [b.subject.id, b.identity.id];
  return [
    {
      id: `baseline:${b.identity.id}`,
      kind: 'baseline',
      text: `${b.subject.label} has actual baseline ${b.identity.label} during ${b.period} at revision ${b.revision}.`,
      entityIds: [...ids],
      source: { ...b.source },
    },
    {
      id: 'evidence',
      kind: 'evidence',
      text: `${b.subject.label} compares illustrative operating-unit records from actual baseline ${b.identity.label} during ${b.period} at revision ${b.revision}.`,
      entityIds: [...ids],
      source: { ...lens.evidence.source },
    },
    ...(lens.native
      ? [
          {
            id: 'native:A-03',
            kind: 'native' as const,
            text: `${b.subject.label} maintains illustrative operating-unit records of actual baseline ${b.identity.label} during ${b.period} at revision ${b.revision}.`,
            entityIds: [...ids],
            source: { ...lens.native.source },
          },
        ]
      : []),
    {
      id: 'scope',
      kind: 'scope',
      text: BUSINESS_ALTERNATIVE_SCOPE,
      entityIds: businessAlternativeSemanticIds(scene, lens),
      source: null,
    },
    {
      id: 'context',
      kind: 'context',
      text: `Records for ${context}.`,
      entityIds: [...ids],
      source: { ...b.source },
    },
    ...scene.alternatives.map((alternative) => {
      const record = lens.records.find((entry) => entry.alternativeId === alternative.id);
      if (!record) throw new Error('Alternative lacks its literal source record');
      return {
        id: `record:${record.identity.id}`,
        kind: 'record' as const,
        text: `${alternative.label}: ${record.identity.label} is an illustrative operating-unit record representing ${alternative.qualifier}.`,
        entityIds: [...ids, alternative.id, record.identity.id],
        source: { ...record.source },
      };
    }),
    {
      id: 'uncertainty',
      kind: 'uncertainty',
      text: scene.uncertainty,
      entityIds: [...ids, ...scene.alternatives.map((alternative) => alternative.id)],
      source: null,
    },
  ];
}

export function businessAlternativeReadingStart(scene: PossibleFuturesScene): number {
  return scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
}

function lines(fact: BusinessAlternativeFact, width: number) {
  return businessLabelLines(fact.text, width, BUSINESS_ALTERNATIVE_READING.bodyFont).map(
    (text, slot) => ({ id: `${fact.id}:line:${slot}`, text }),
  );
}

/** Complete context pages, then all alternatives together in equal-sized qualitative cards. */
function layouts(scene: PossibleFuturesScene, lens: BusinessAlternativesLens) {
  const R = BUSINESS_ALTERNATIVE_READING;
  const facts = businessAlternativeFacts(scene, lens);
  const pages: Omit<BusinessAlternativePage, 'start' | 'end'>[] = [];
  const titleLines = businessLabelLines(
    'Same-baseline operating-design snapshot',
    R.rail,
    R.titleFont,
  );
  const top = R.padding + titleLines.length * R.titleLineHeight + R.gap;
  const bottom = R.height - R.padding;
  let cards: BusinessAlternativeLayout[] = [];
  let cursor = top;
  function finish() {
    pages.push({
      id: cards.map((card) => card.fact.id).join('|'),
      titleLines: [...titleLines],
      cards,
    });
    cards = [];
    cursor = top;
  }
  for (const fact of facts.filter(
    (entry) => !['context', 'record', 'uncertainty'].includes(entry.kind),
  )) {
    const body = lines(fact, R.rail - 2 * R.padding);
    const height = body.length * R.lineHeight + 2 * R.padding;
    if (!body.length || height > bottom - top) throw new Error('Complete fact exceeds its rail');
    if (cursor + height > bottom) finish();
    cards.push({
      fact,
      title: '',
      titleLines: [],
      lines: body,
      x: R.padding,
      y: cursor,
      width: R.rail,
      height,
    });
    cursor += height + R.gap;
  }
  if (cards.length) finish();
  const context = facts.find((fact) => fact.kind === 'context');
  const uncertainty = facts.find((fact) => fact.kind === 'uncertainty');
  if (!context || !uncertainty) throw new Error('Missing source context/uncertainty');
  // Context and uncertainty are complete facts on the same page as every alternative.
  const contextLines = lines(context, R.rail);
  const uncertaintyLines = lines(uncertainty, R.rail);
  const headerHeight = (contextLines.length + uncertaintyLines.length) * R.lineHeight;
  const recordTop = R.padding + headerHeight + R.gap;
  const recordFacts = facts.filter((fact) => fact.kind === 'record');
  const recordHeight = (bottom - recordTop - (recordFacts.length - 1) * R.gap) / recordFacts.length;
  const recordCards = recordFacts.map((fact, slot) => {
    const title = scene.alternatives[slot].label;
    // The original label is printed inline with its complete record fact, not as a second rail.
    const heading: string[] = [];
    const body = lines(fact, R.rail - 2 * R.padding);
    if (
      2 * R.padding + heading.length * R.titleLineHeight + body.length * R.lineHeight >
      recordHeight
    )
      throw new Error('Equal alternative cards exceed complete fixed-font rail');
    return {
      fact,
      title,
      titleLines: heading,
      lines: body,
      x: R.padding,
      y: recordTop + slot * (recordHeight + R.gap),
      width: R.rail,
      height: recordHeight,
    };
  });
  pages.push({
    id: 'equal-alternatives',
    titleLines: [],
    cards: [
      {
        fact: context,
        title: '',
        titleLines: [],
        lines: contextLines,
        x: R.padding,
        y: R.padding,
        width: R.rail,
        height: contextLines.length * R.lineHeight,
      },
      {
        fact: uncertainty,
        title: '',
        titleLines: [],
        lines: uncertaintyLines,
        x: R.padding,
        y: R.padding + contextLines.length * R.lineHeight,
        width: R.rail,
        height: uncertaintyLines.length * R.lineHeight,
      },
      ...recordCards,
    ],
  });
  return pages;
}

export function businessAlternativeNativeLabels(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
): {
  header: string[];
  records: {
    id: string;
    alternativeId: string;
    lines: string[];
    x: number;
    width: number;
    y: number;
  }[];
} {
  const R = BUSINESS_ALTERNATIVE_READING;
  const b = lens.baseline;
  return {
    header: businessLabelLines(
      `Illustrative operating-unit records for ${b.subject.label}; actual baseline ${b.identity.label}, ${b.period}, revision ${b.revision}. Not actual branches or achieved output. ${scene.uncertainty}.`,
      R.rail,
      R.bodyFont,
    ),
    records: lens.records.map((record, slot) => {
      const alternative = scene.alternatives[slot];
      const width = R.rail / lens.records.length;
      return {
        id: record.identity.id,
        alternativeId: record.alternativeId,
        lines: businessLabelLines(
          `${alternative.label}: ${record.identity.label}; ${alternative.qualifier}.`,
          width - 2 * R.padding,
          R.bodyFont,
        ),
        x: R.padding + slot * width,
        width,
        y: 350,
      };
    }),
  };
}

/** Shared parser/renderer gate, evaluated only after the real response handoff is opaque. */
export function businessAlternativeReadingFits(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
): boolean {
  const beats = [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt];
  const ids = businessAlternativeSemanticIds(scene, lens);
  if (
    !beats.every(Number.isFinite) ||
    beats.some((beat, i) => i > 0 && beat <= beats[i - 1]) ||
    lens.version !== 1 ||
    lens.evidence.state !== 'illustrative' ||
    !['diagram', 'hybrid'].includes(lens.visualMode) ||
    (lens.visualMode === 'hybrid' && lens.native?.assembly !== 'A-03') ||
    scene.preset !== 'branching-scenarios' ||
    !/\b(?:uncertain|unresolved|not certain|no outcome is certain|no winner|no single forecast)\b/i.test(
      scene.uncertainty,
    ) ||
    scene.alternatives.length < 2 ||
    scene.alternatives.length > 3 ||
    lens.records.length !== scene.alternatives.length ||
    ids.length > 8 ||
    new Set(ids).size !== ids.length ||
    !Number.isFinite(lens.finalHoldSeconds) ||
    lens.finalHoldSeconds < 0.8
  )
    return false;
  try {
    const R = BUSINESS_ALTERNATIVE_READING;
    const pages = layouts(scene, lens);
    const ready = businessAlternativeReadingStart(scene);
    const nativeLabels = businessAlternativeNativeLabels(scene, lens);
    return (
      (!lens.native ||
        (R.padding + nativeLabels.header.length * R.lineHeight <= 150 &&
          nativeLabels.header.every((line) => businessTextWidth(line, R.bodyFont) <= R.rail) &&
          nativeLabels.records.every(
            (record) =>
              record.y + record.lines.length * R.lineHeight <= R.height - R.padding &&
              record.x >= R.padding &&
              record.x + record.width <= R.width - R.padding + 1e-7 &&
              record.lines.every(
                (line) => businessTextWidth(line, R.bodyFont) <= record.width - 2 * R.padding,
              ),
          ))) &&
      pages.length > 0 &&
      pages.length <= 4 &&
      diagramPose(ready, scene).diagramOpacity >= 1 - 1e-7 &&
      scene.resolveAt - ready >= pages.length * R.pageHold &&
      pages.every(
        (page) =>
          page.titleLines.every((text) => businessTextWidth(text, R.titleFont) <= R.rail) &&
          page.cards.every(
            (card) =>
              card.y + card.height <= R.height - R.padding + 1e-7 &&
              card.titleLines.every(
                (text) => businessTextWidth(text, R.titleFont) <= card.width - 2 * R.padding,
              ) &&
              card.lines.every(
                (line) =>
                  businessTextWidth(line.text, R.bodyFont) <=
                  (card.fact.kind === 'context' || card.fact.kind === 'uncertainty'
                    ? card.width
                    : card.width - 2 * R.padding),
              ),
          ),
      )
    );
  } catch {
    return false;
  }
}

export function businessAlternativePages(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
): BusinessAlternativePage[] {
  if (!businessAlternativeReadingFits(scene, lens))
    throw new Error('Alternative snapshot exceeds source reading budget');
  const pages = layouts(scene, lens);
  const ready = businessAlternativeReadingStart(scene);
  const duration = (scene.resolveAt - ready) / pages.length;
  return pages.map((page, slot) => ({
    ...page,
    start: ready + slot * duration,
    end:
      slot === pages.length - 1
        ? scene.resolveAt + lens.finalHoldSeconds
        : ready + (slot + 1) * duration,
  }));
}

export function businessAlternativePageAt(
  scene: PossibleFuturesScene,
  lens: BusinessAlternativesLens,
  seconds: number,
): BusinessAlternativePage {
  const pages = businessAlternativePages(scene, lens);
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt;
  return pages.find((page) => t < page.end) ?? pages[pages.length - 1];
}
