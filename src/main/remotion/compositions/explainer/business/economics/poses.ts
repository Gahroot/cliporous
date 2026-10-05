import type { BusinessAssemblyInstance } from '../assets/types';
import {
  type BusinessClock,
  businessPhases,
  sampleAlternatives,
  sampleConservedParts,
  sampleSnapshots,
} from '../motion';
import type { QuantityBasis } from '../types';
import { economicsFacts } from './identities';
import type { EconomicsMoneyFact, EconomicsScene } from './types';

function observed(fact: EconomicsMoneyFact): boolean {
  return fact.state === 'source-stated' && fact.money !== null;
}
function sameBasis(a: QuantityBasis, b: QuantityBasis): boolean {
  return (
    a.denominator !== null &&
    a.denominator === b.denominator &&
    a.subjectId === b.subjectId &&
    a.unit === b.unit &&
    a.population === b.population &&
    a.period === b.period
  );
}
interface Decomposition {
  id: string;
  total: number;
  parts: { id: string; amount: number }[];
}
/** OP-40 deliberately excludes profit, cash and receivables from revenue decomposition. */
export function economicsDecompositions(scene: EconomicsScene): Decomposition[] {
  const result: Decomposition[] = [];
  function add(
    id: string,
    total: EconomicsMoneyFact,
    parts: { id: string; fact: EconomicsMoneyFact }[],
  ) {
    if (
      !observed(total) ||
      !total.money ||
      total.money.minorUnits <= 0 ||
      parts.some(
        (p) =>
          !observed(p.fact) ||
          !p.fact.money ||
          !sameBasis(total.basis, p.fact.basis) ||
          p.fact.money.currency !== total.money?.currency,
      )
    )
      return;
    const amounts = parts.map((p) => ({ id: p.id, amount: p.fact.money?.minorUnits ?? 0 }));
    const sum = amounts.reduce((n, p) => n + p.amount, 0);
    if (!Number.isSafeInteger(sum) || sum !== total.money.minorUnits) return;
    result.push({ id, total: total.money.minorUnits, parts: amounts });
  }
  switch (scene.preset) {
    case 'per-outcome':
      add(
        'total',
        scene.total,
        scene.components.map((p) => ({ id: p.identity.id, fact: p.cost })),
      );
      break;
    case 'fixed-variable':
      for (const sample of scene.samples)
        add(`${sample.identity.id}:total`, sample.total, [
          { id: `${sample.identity.id}:fixed`, fact: sample.fixedCost },
          { id: `${sample.identity.id}:variable`, fact: sample.variableCost },
        ]);
      break;
    case 'accounting-bases':
      add('revenue', scene.revenue.fact, [
        ...scene.costs.map((p) => ({ id: p.identity.id, fact: p.cost })),
        { id: 'stated-cost-remainder', fact: scene.statedCostRemainder },
      ]);
      break;
    case 'source-stated-allocation':
      if (scene.carrier?.representation === 'numeric')
        add('total', scene.total, [
          ...scene.allocations.map((p) => ({ id: p.identity.id, fact: p.amount })),
          { id: scene.remainder.identity.id, fact: scene.remainder.amount },
        ]);
      break;
  }
  return result;
}
export function sampleEconomicsFrame(scene: EconomicsScene, frame: number, fps: number) {
  const seconds = Number.isFinite(frame) && Number.isFinite(fps) && fps > 0 ? frame / fps : 0;
  return sampleEconomics(scene, Number.isFinite(seconds) ? seconds : 0);
}
/** Seconds/frame seek only: no live clocks, random, physics, or changes to source counters. */
export function sampleEconomics(scene: EconomicsScene, seconds: number) {
  const time = Number.isFinite(seconds)
    ? Math.max(0, Math.min(seconds, scene.resolveAt + scene.finalHoldSeconds))
    : 0;
  const clock: BusinessClock = { frame: time * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock);
  const decompositions = economicsDecompositions(scene).map((group) => ({
    id: group.id,
    ...sampleConservedParts(clock, group.total, group.parts),
  }));
  const snapshots =
    scene.preset === 'implementation-periods'
      ? sampleSnapshots(
          clock,
          scene.periods.map((p) => ({ id: p.identity.id, date: p.date })),
        )
      : [];
  const alternatives =
    scene.preset === 'output-staffing' || scene.preset === 'comparable-pricing-bases'
      ? sampleAlternatives(
          clock,
          (scene.preset === 'output-staffing' ? scene.samples : scene.offers).map(
            (p) => p.identity.id,
          ),
        )
      : [];
  const sourceFacts = economicsFacts(scene).map(({ id, label, fact }) => ({ id, label, ...fact }));
  const allocationWeights = decompositions[0]?.parts.map((p) => p.visualWeight) ?? [];
  const fills: [number, number, number, number] =
    scene.preset === 'source-stated-allocation' && allocationWeights.length === 4
      ? [allocationWeights[0], allocationWeights[1], allocationWeights[2], allocationWeights[3]]
      : [0, 0, 0, 0];
  return { ...phases, decompositions, snapshots, alternatives, sourceFacts, fills };
}
export function economicsAssembly(
  scene: EconomicsScene,
  pose: ReturnType<typeof sampleEconomics>,
): BusinessAssemblyInstance | null {
  const gate = scene.carrier;
  if (!gate) return null;
  const identityId = scene.activity.id;
  switch (scene.preset) {
    case 'per-outcome':
    case 'accounting-bases':
      // Neutral illustrated paperwork, not an observed approval/pending decision.
      return gate.asset === 'A-04'
        ? { identityId, assembly: { asset: 'A-04', pending: true } }
        : null;
    case 'fixed-variable':
    case 'output-staffing':
      // The empty illustrative chair does not measure occupancy, staffing or success.
      return gate.asset === 'A-02'
        ? { identityId, assembly: { asset: 'A-02', occupied: false } }
        : null;
    case 'implementation-periods':
      return gate.asset === 'A-07'
        ? {
            identityId,
            assembly: {
              asset: 'A-07',
              open: pose.action,
              revision: scene.periods.length === 2 && pose.snapshots[1]?.focused ? 1 : 0,
            },
          }
        : null;
    case 'source-stated-allocation':
      return gate.asset === 'A-10'
        ? { identityId, assembly: { asset: 'A-10', fills: pose.fills } }
        : null;
  }
}
