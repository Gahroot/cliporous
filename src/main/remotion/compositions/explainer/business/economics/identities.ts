import type { BusinessIdentity } from '../types';
import type { EconomicsCountFact, EconomicsMoneyFact, EconomicsScene } from './types';

export interface EconomicsFactView {
  id: string;
  label: string;
  identityId: string;
  fact: EconomicsMoneyFact | EconomicsCountFact;
}
export function economicsIdentities(scene: EconomicsScene): BusinessIdentity[] {
  const identities = [scene.business, scene.activity];
  switch (scene.preset) {
    case 'per-outcome':
      identities.push(...scene.components.map((entry) => entry.identity));
      break;
    case 'fixed-variable':
      identities.push(scene.fixed, scene.variable, ...scene.samples.map((entry) => entry.identity));
      break;
    case 'output-staffing':
      identities.push(...scene.samples.map((entry) => entry.identity));
      break;
    case 'implementation-periods':
      identities.push(...scene.periods.map((entry) => entry.identity));
      break;
    case 'comparable-pricing-bases':
      identities.push(...scene.offers.map((entry) => entry.identity));
      break;
    case 'source-stated-allocation':
      identities.push(
        ...scene.allocations.map((entry) => entry.identity),
        scene.remainder.identity,
      );
      break;
    case 'accounting-bases':
      identities.push(...scene.costs.map((entry) => entry.identity));
      break;
  }
  return identities;
}
/** Every supported metric remains a stable fact, independent of page, mode or motion. */
export function economicsFacts(scene: EconomicsScene): EconomicsFactView[] {
  const activity = scene.activity.id;
  const view = (
    id: string,
    label: string,
    identityId: string,
    fact: EconomicsFactView['fact'],
  ): EconomicsFactView => ({ id, label, identityId, fact });
  switch (scene.preset) {
    case 'per-outcome':
      return [
        ...scene.components.map((entry) =>
          view(entry.identity.id, `${entry.identity.label} cost`, entry.identity.id, entry.cost),
        ),
        view('total', 'Stated total cost', activity, scene.total),
        view('resolved', 'Resolved tasks (not paid outcomes)', activity, scene.resolved),
        view('per-outcome', 'Cost per resolved task', activity, scene.perOutcome),
      ];
    case 'fixed-variable':
      return scene.samples.flatMap((sample) => [
        view(
          `${sample.identity.id}:output`,
          `${sample.identity.label} output`,
          sample.identity.id,
          sample.output,
        ),
        view(
          `${sample.identity.id}:fixed`,
          `${scene.fixed.label} fixed cost`,
          scene.fixed.id,
          sample.fixedCost,
        ),
        view(
          `${sample.identity.id}:variable`,
          `${scene.variable.label} variable cost`,
          scene.variable.id,
          sample.variableCost,
        ),
        view(
          `${sample.identity.id}:total`,
          `${sample.identity.label} stated total`,
          sample.identity.id,
          sample.total,
        ),
      ]);
    case 'output-staffing':
      return scene.samples.flatMap((sample) => [
        view(
          `${sample.identity.id}:output`,
          `${sample.identity.label} output`,
          sample.identity.id,
          sample.output,
        ),
        view(
          `${sample.identity.id}:staffing`,
          `${sample.identity.label} staffing`,
          sample.identity.id,
          sample.staffing,
        ),
      ]);
    case 'implementation-periods':
      return scene.periods.flatMap((period) => [
        view(
          `${period.identity.id}:cost`,
          `${period.identity.label} implementation cost`,
          period.identity.id,
          period.cost,
        ),
        view(
          `${period.identity.id}:output`,
          `${period.identity.label} observed output`,
          period.identity.id,
          period.output,
        ),
      ]);
    case 'comparable-pricing-bases':
      return scene.offers.map((offer) =>
        view(
          offer.identity.id,
          `${offer.identity.label} quoted price`,
          offer.identity.id,
          offer.price,
        ),
      );
    case 'source-stated-allocation':
      return [
        view('total', 'Stated allocation total', activity, scene.total),
        ...scene.allocations.map((entry) =>
          view(
            entry.identity.id,
            `${entry.identity.label} allocation`,
            entry.identity.id,
            entry.amount,
          ),
        ),
        view(
          scene.remainder.identity.id,
          `${scene.remainder.identity.label} retained remainder`,
          scene.remainder.identity.id,
          scene.remainder.amount,
        ),
      ];
    case 'accounting-bases':
      return [
        view('revenue', `${scene.revenue.accounting} revenue`, activity, scene.revenue.fact),
        ...scene.costs.map((entry) =>
          view(
            entry.identity.id,
            `${scene.revenue.accounting} ${entry.identity.label} stated cost`,
            entry.identity.id,
            entry.cost,
          ),
        ),
        view(
          'stated-cost-remainder',
          `${scene.revenue.accounting} stated-cost remainder (not profit)`,
          activity,
          scene.statedCostRemainder,
        ),
        ...(scene.profit
          ? [
              view(
                'profit',
                `Source-stated ${scene.profit.accounting} profit`,
                activity,
                scene.profit.fact,
              ),
            ]
          : []),
        ...(scene.cash
          ? [view('cash', `${scene.cash.accounting} cash`, activity, scene.cash.fact)]
          : []),
        ...(scene.receivable
          ? [view('receivable', 'Receivable (not received cash)', activity, scene.receivable)]
          : []),
      ];
  }
}
