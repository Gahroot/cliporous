import { labelLines } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { formatMoney } from '../../finance/poses';
import { economicsFacts, economicsIdentities } from './identities';
import { ECONOMICS_LIMITS, type EconomicsScene } from './types';

export interface EconomicsReadingCard {
  id: string;
  title: string;
  lines: string[];
}
/** Canonical complete text for the later fixed-font presentation; no facts are elided. */
export function economicsReadingCards(scene: EconomicsScene): EconomicsReadingCard[] {
  const names = new Map(
    economicsIdentities(scene).map((identity) => [identity.id, identity.label]),
  );
  return economicsFacts(scene).map(({ id, label, fact }) => {
    const amount =
      'money' in fact
        ? fact.money
          ? formatMoney(fact.money)
          : 'Amount not stated'
        : fact.count === null
          ? 'Count not stated'
          : `${fact.count} ${fact.basis.unit}`;
    const b = fact.basis;
    return {
      id,
      title: label,
      lines: [
        amount,
        `State: ${fact.state}`,
        `Subject: ${names.get(b.subjectId) ?? b.subjectId}`,
        `${scene.preset === 'implementation-periods' ? 'Playbook' : 'Activity'}: ${scene.activity.label}`,
        `Unit: ${b.unit}`,
        `Population: ${b.population}`,
        `Period: ${b.period}`,
        `Denominator: ${b.denominator === null ? 'unknown' : b.denominator}`,
        ...(scene.preset === 'implementation-periods'
          ? scene.periods
              .filter((period) => id.startsWith(`${period.identity.id}:`))
              .flatMap((period) => [`Version: ${period.version}`, `Date: ${period.date}`])
          : []),
      ],
    };
  });
}
export const ECONOMICS_READING_LAYOUT = {
  railWidth: 952,
  margin: 16,
  gap: 24,
  padding: 16,
  // A conservative 1.2em advance, not average character width. The resulting
  // 14/15-column lines fit 416px of inner width, including repeated wide Ws.
  maxGlyphEm: 1.2,
  titleColumns: 14,
  columns: 15,
  titleSize: 24,
  bodySize: 22,
  lineHeight: 1.2,
  cardHeight: 446,
  cardsPerPage: 2,
} as const;
/** Natural fixed text size. Returns false, never throws or truncates, on expected excess. */
export function economicsReadingFits(scene: EconomicsScene): boolean {
  const cards = economicsReadingCards(scene);
  const L = ECONOMICS_READING_LAYOUT;
  const pages = Math.ceil(cards.length / L.cardsPerPage);
  if (pages < 1 || pages > ECONOMICS_LIMITS.pages) return false;
  if (
    cards.some((card) => {
      // The authored Latin font budget does not promise arbitrary fallback glyphs.
      if (![card.title, ...card.lines].every((line) => /^[\p{ASCII}]+$/u.test(line))) return true;
      const titleHeight =
        labelLines(card.title, L.titleColumns).length * L.titleSize * L.lineHeight;
      const bodyHeight = card.lines.reduce(
        (height, line) => height + labelLines(line, L.columns).length * L.bodySize * L.lineHeight,
        0,
      );
      const innerWidth = (L.railWidth - 2 * L.margin - L.gap) / 2 - 2 * L.padding;
      return (
        L.titleColumns * L.titleSize * L.maxGlyphEm > innerWidth ||
        L.columns * L.bodySize * L.maxGlyphEm > innerWidth ||
        2 * L.padding + titleHeight + bodyHeight > L.cardHeight
      );
    })
  )
    return false;
  // Every complete page gets 1.5 seconds before the settled resolve beat. The last
  // page then persists for finalHoldSeconds. Identical conservative budget in D/H.
  const readingStart = scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
  if (diagramPose(readingStart, scene).diagramOpacity < 1 - 1e-7) return false;
  return (
    scene.resolveAt - readingStart + 1e-7 >= pages * ECONOMICS_LIMITS.pageHold &&
    scene.finalHoldSeconds + 1e-7 >= ECONOMICS_LIMITS.finalHold
  );
}
