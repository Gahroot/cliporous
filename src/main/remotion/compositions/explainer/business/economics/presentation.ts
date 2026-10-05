import { labelLines } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { economicsFacts } from './identities';
import {
  type EconomicsReadingCard,
  economicsReadingCards,
  economicsReadingFits,
  ECONOMICS_READING_LAYOUT as R,
} from './readability';
import { ECONOMICS_LIMITS, type EconomicsScene } from './types';

export interface EconomicsCardLayout {
  card: EconomicsReadingCard;
  x: number;
  y: number;
  width: number;
  height: number;
  titleY: number;
  lineY: number[];
}
export interface EconomicsPage {
  index: number;
  start: number;
  end: number;
  cards: EconomicsCardLayout[];
}
/** Each alternative appears beside its peer for the same complete page interval. */
function orderedCards(scene: EconomicsScene): EconomicsReadingCard[] {
  const cards = economicsReadingCards(scene);
  if (scene.preset === 'output-staffing' || scene.preset === 'fixed-variable') {
    const metrics =
      scene.preset === 'output-staffing'
        ? ['output', 'staffing']
        : ['output', 'fixed', 'variable', 'total'];
    return metrics.flatMap((metric) =>
      scene.samples.flatMap((sample) =>
        cards.filter((card) => card.id === `${sample.identity.id}:${metric}`),
      ),
    );
  }
  return cards;
}
export function layoutEconomicsCard(card: EconomicsReadingCard, slot: number): EconomicsCardLayout {
  const width = (R.railWidth - 2 * R.margin - R.gap) / 2;
  const y = R.margin,
    x = R.margin + slot * (width + R.gap);
  let cursor =
    y + R.padding + labelLines(card.title, R.titleColumns).length * R.titleSize * R.lineHeight;
  const lineY = card.lines.map((line) => {
    const baseline = cursor + R.bodySize;
    cursor += labelLines(line, R.columns).length * R.bodySize * R.lineHeight;
    return baseline;
  });
  return { card, x, y, width, height: R.cardHeight, titleY: y + R.padding + R.titleSize, lineY };
}
export function economicsPages(scene: EconomicsScene): EconomicsPage[] {
  if (!economicsReadingFits(scene))
    throw new Error('Validated economics scene exceeds its fixed reading budget');
  const cards = orderedCards(scene);
  const start = scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
  if (diagramPose(start, scene).diagramOpacity < 1 - 1e-7)
    throw new Error('Economics pages require complete diagram opacity');
  const count = Math.ceil(cards.length / R.cardsPerPage);
  return Array.from({ length: count }, (_, index) => ({
    index,
    start: start + index * ECONOMICS_LIMITS.pageHold,
    end:
      index === count - 1
        ? scene.resolveAt + scene.finalHoldSeconds
        : start + (index + 1) * ECONOMICS_LIMITS.pageHold,
    cards: cards
      .slice(index * R.cardsPerPage, (index + 1) * R.cardsPerPage)
      .map(layoutEconomicsCard),
  }));
}
export function economicsActivePage(scene: EconomicsScene, seconds: number): EconomicsPage {
  const pages = economicsPages(scene),
    t = Number.isFinite(seconds) ? seconds : 0;
  return pages.find((page) => t < page.end) ?? pages[pages.length - 1];
}
export function economicsContentCounts(scene: EconomicsScene) {
  const facts = economicsFacts(scene);
  return {
    facts: facts.length,
    holds: facts.filter(({ fact }) => fact.state !== 'source-stated').length,
    pages: economicsPages(scene).length,
  };
}
