import { diagramPose } from '../../diagrams/motion';
import { businessLabelLines, businessTextWidth } from '../text-width';
import type { BusinessIdentity, QuantityBasis } from '../types';
import type { CapitalMoneyFact, CapitalScene } from './types';
import { CAPITAL_LIMITS as L } from './types';

export const CAPITAL_READING = {
  width: 952,
  height: 478,
  margin: 12,
  gap: 12,
  padding: 16,
  titleSize: 24,
  bodySize: 22,
  lineHeight: 1.2,
} as const;
export interface CapitalLine {
  id: string;
  text: string;
}
export interface CapitalCard {
  id: string;
  title: string;
  lines: CapitalLine[];
}
export interface CapitalCardLayout {
  card: CapitalCard;
  x: number;
  y: number;
  width: number;
  height: number;
  titleLines: string[];
  bodyLines: { id: string; text: string; y: number }[];
}
export interface CapitalPage {
  id: string;
  start: number;
  end: number;
  cards: CapitalCardLayout[];
}
function line(id: string, text: string): CapitalLine {
  return { id, text };
}
export function capitalBasisLabel(b: QuantityBasis): string {
  return `Basis: ${b.population}; ${b.unit}; ${b.period}; denominator ${b.denominator === null ? 'unknown' : b.denominator}.`;
}
export function capitalMoneyLabel(q: CapitalMoneyFact): string {
  if (!q.money)
    return `${q.state === 'negative' ? 'Explicitly absent' : 'Unknown'} ${q.basis.unit}`;
  // Integer minor units remain exact (no floating-point amount formatting).
  const whole = Math.floor(q.money.minorUnits / 100);
  const cents = String(q.money.minorUnits % 100).padStart(2, '0');
  return `${q.money.currency} ${whole}.${cents}${q.state === 'conditional' ? ' — conditional, not observed' : q.state === 'pending' ? ' — pending, not settled' : ''}`;
}
function person(identity: BusinessIdentity, role: string): string {
  return `${role}: ${identity.label}`;
}
/** Full names/roles/bases/conditions/dates, never ID stand-ins, truncated labels or inferred value. */
export function capitalCards(scene: CapitalScene): CapitalCard[] {
  const subject = person(scene.company, 'Subject');
  if (scene.kind === 'economic-rights') {
    const claim: CapitalCard = {
      id: `${scene.claim.id}:claim`,
      title: scene.claim.label,
      lines: [
        line('subject', subject),
        line('holder', person(scene.holder, 'Claim holder')),
        line('relationship', scene.claimEvidence.label),
      ],
    };
    if (scene.preset === 'claim-asset-distinction')
      return [
        {
          ...claim,
          lines: [
            ...claim.lines,
            line('transfer', scene.transfer.label),
            line('state', `Transfer state: ${scene.transfer.state}`),
          ],
        },
        {
          id: `${scene.company.id}:liquidity`,
          title: scene.company.label,
          lines: [
            line('role', 'Underlying financial asset'),
            line('liquidity', scene.liquidity.label),
            line('state', `Liquidity state: ${scene.liquidity.state}`),
            line('period', `Period: ${scene.period}`),
          ],
        },
      ];
    return [
      {
        id: `${scene.holder.id}:shares`,
        title: scene.holder.label,
        lines: [
          line('subject', subject),
          line('role', 'Share holder'),
          line(
            'shares',
            `${scene.ownership.shares} / ${scene.ownership.total} shares; ${scene.ownership.percent} percent`,
          ),
          line('basis', capitalBasisLabel(scene.ownership.basis)),
          line('control', scene.control.label),
        ],
      },
      {
        ...claim,
        lines: [
          ...claim.lines,
          line('priority', scene.priority.label),
          line('priority-state', `Priority: ${scene.priority.state}`),
        ],
      },
      {
        id: `${scene.claim.id}:payout`,
        title: `${scene.claim.label} payout`,
        lines: [
          line('subject', subject),
          line('holder', person(scene.holder, 'Claim holder')),
          line('payout', capitalMoneyLabel(scene.payout)),
          line('basis', capitalBasisLabel(scene.payout.basis)),
          line('meaning', 'Payout is independent of shares and control'),
        ],
      },
    ];
  }
  if (scene.kind === 'investment-outcomes')
    return scene.outcomes.map((o) => ({
      id: o.identity.id,
      title: o.identity.label,
      lines: [
        line('subject', subject),
        line(
          'role',
          `Financial ${o.measure}${o.measure === 'loss' ? ' magnitude (loss direction)' : ''}`,
        ),
        line('amount', capitalMoneyLabel(o.amount)),
        line('basis', capitalBasisLabel(o.amount.basis)),
        line('set', `Source ${scene.setMode}`),
        line(
          'probability',
          o.probability
            ? `Source probability: ${o.probability.numerator} / ${o.probability.denominator}`
            : 'Probability: not stated',
        ),
      ],
    }));
  if (scene.preset === 'conditional-rounds')
    return [
      {
        id: `${scene.holder.id}:baseline`,
        title: scene.holder.label,
        lines: [
          line('subject', subject),
          line('role', 'Existing share holder'),
          line(
            'shares',
            `${scene.ownership.shares} / ${scene.ownership.total} shares; ${scene.ownership.percent} percent`,
          ),
          line('basis', capitalBasisLabel(scene.ownership.basis)),
        ],
      },
      ...scene.rounds.map((r) => ({
        id: r.identity.identity.id,
        title: r.identity.identity.label,
        lines: [
          line('subject', subject),
          line('version', `Source version: ${r.identity.version}`),
          line(
            'state',
            `Round: ${r.status}${r.status === 'issued' ? '' : ' — not observed issuance'}`,
          ),
          line('commitment', `Commitment: ${capitalMoneyLabel(r.commitment)}`),
          line('money-basis', capitalBasisLabel(r.commitment.basis)),
          line(
            'shares',
            `${r.issued} new shares; total ${r.beforeTotal} → ${r.afterTotal}; ${scene.holder.label} retains ${scene.ownership.shares}; ${r.beforePercent} → ${r.afterPercent} percent`,
          ),
          line('share-basis', capitalBasisLabel(r.shareBasis)),
          ...(r.status === 'conditional' && scene.condition
            ? [line('condition', scene.condition)]
            : []),
        ],
      })),
    ];
  const obligations: CapitalCard[] = scene.obligations.map((o) => ({
    id: o.identity.id,
    title: o.identity.label,
    lines: [
      line('subject', subject),
      line('lender', person(scene.lender, 'Lender')),
      line('role', 'Debt obligation — not physical capacity'),
      line('principal', capitalMoneyLabel(o.principal)),
      line('maturity', `Maturity: ${o.maturity}`),
      line('basis', capitalBasisLabel(o.principal.basis)),
    ],
  }));
  if (scene.preset === 'financing-versus-capacity')
    return [
      ...obligations,
      {
        id: scene.asset.id,
        title: scene.asset.label,
        lines: [
          line('subject', subject),
          line('role', 'Physical data-center rack installation'),
          line(
            'installed',
            `Installed: ${scene.installed.count ?? 'unknown'} ${scene.installed.basis.unit}`,
          ),
          line(
            'commissioned',
            `Commissioned: ${scene.commissioned.count ?? 'unknown'} ${scene.commissioned.basis.unit}`,
          ),
          line('basis', capitalBasisLabel(scene.installed.basis)),
          line('meaning', 'Financing is not commissioning or power'),
          line(
            'authored-calendar-slots',
            `Calendar: 3 reading slots; ${3 - scene.obligations.length} unassigned, not maturities or events.`,
          ),
        ],
      },
    ];
  return [
    ...obligations,
    {
      id: scene.asset.id,
      title: scene.asset.label,
      lines: [
        line('subject', subject),
        line('role', 'Underlying asset — not the debt claim'),
        line('duration', scene.duration.label),
        line('liquidity', scene.liquidity.label),
        line('period', `Period: ${scene.period}`),
        line(
          'authored-calendar-slots',
          `Calendar: 3 reading slots; ${3 - scene.obligations.length} unassigned, not maturities or events.`,
        ),
      ],
    },
  ];
}
export function layoutCapitalCard(
  card: CapitalCard,
  slot: number,
  columns: number,
): CapitalCardLayout {
  const R = CAPITAL_READING;
  const width = (R.width - 2 * R.margin - (columns - 1) * R.gap) / columns;
  const rail = width - 2 * R.padding;
  const titleLines = businessLabelLines(card.title, rail, R.titleSize);
  let cursor = R.margin + R.padding + titleLines.length * R.titleSize * R.lineHeight + 8;
  const bodyLines = card.lines.flatMap((value) =>
    businessLabelLines(value.text, rail, R.bodySize).map((text, position) => {
      const y = cursor + R.bodySize;
      cursor += R.bodySize * R.lineHeight;
      return { id: `${card.id}:${value.id}:line-${position}`, text, y };
    }),
  );
  return {
    card,
    x: R.margin + slot * (width + R.gap),
    y: R.margin,
    width,
    height: R.height - 2 * R.margin,
    titleLines,
    bodyLines,
  };
}
function groups(scene: CapitalScene): CapitalCard[][] {
  const cards = capitalCards(scene);
  // All financial outcomes appear simultaneously, with equal area/frequency/time.
  if (scene.kind === 'investment-outcomes') return [cards];
  // Dense conditional rounds get a whole rail each, not smaller fonts or cropped conditions.
  if (scene.preset === 'conditional-rounds') return cards.map((card) => [card]);
  return Array.from({ length: Math.ceil(cards.length / 2) }, (_, i) =>
    cards.slice(i * 2, i * 2 + 2),
  );
}
export function capitalDiagramReady(scene: CapitalScene): number {
  return scene.responseAt + Math.min(0.7, scene.checkAt - scene.responseAt);
}
export function capitalReadingFits(scene: CapitalScene): boolean {
  const R = CAPITAL_READING;
  const pages = groups(scene);
  const ready = capitalDiagramReady(scene);
  if (
    pages.length > L.pages ||
    diagramPose(ready, scene).diagramOpacity < 1 - 1e-7 ||
    ready + (pages.length - 1) * L.pageHold > scene.resolveAt ||
    ready + pages.length * L.pageHold > scene.resolveAt + scene.finalHoldSeconds
  )
    return false;
  return pages.every((page) =>
    page
      .map((card, slot) => layoutCapitalCard(card, slot, page.length))
      .every((layout) => {
        const rail = layout.width - R.padding * 2;
        return (
          layout.bodyLines.every(
            (value) =>
              value.y <= layout.y + layout.height - R.padding &&
              businessTextWidth(value.text, R.bodySize) <= rail,
          ) && layout.titleLines.every((text) => businessTextWidth(text, R.titleSize) <= rail)
        );
      }),
  );
}
export function capitalPages(scene: CapitalScene): CapitalPage[] {
  if (!capitalReadingFits(scene))
    throw new Error('Capital exceeds fixed complete-page reading budget');
  const ready = capitalDiagramReady(scene);
  const pages = groups(scene);
  return pages.map((cards, index) => ({
    id: cards.map((card) => card.id).join('|'),
    start: ready + index * L.pageHold,
    end:
      index === pages.length - 1
        ? scene.resolveAt + scene.finalHoldSeconds
        : ready + (index + 1) * L.pageHold,
    cards: cards.map((card, slot) => layoutCapitalCard(card, slot, cards.length)),
  }));
}
export function capitalActivePage(scene: CapitalScene, seconds: number): CapitalPage {
  const t = Number.isFinite(seconds) ? seconds : scene.setupAt;
  const pages = capitalPages(scene);
  return pages.find((page) => t < page.end) ?? pages[pages.length - 1];
}
