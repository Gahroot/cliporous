import { compatibleQuantityBases } from '../../../../../ai/explainer/business-contract';
import {
  type BusinessClock,
  businessPhases,
  sampleConditionClamp,
  sampleConservedParts,
  sampleConstraintFocus,
  samplePriorityFill,
  sampleSnapshots,
} from '../motion';
import { type FundsPage, fundsPageAt, fundsRows } from './presentation';
import { type FundsAmount, type FundsScene, fundsAmounts, fundsObserved } from './types';

export interface FundsPose {
  time: number;
  opacity: number;
  holding: boolean;
  page: FundsPage;
  sourceAmounts: FundsAmount[];
  folio: { open: number; contributed: boolean };
  priorities: ReturnType<typeof samplePriorityFill>;
  tierFills: [number, number, number, number];
  focus: ReturnType<typeof sampleConstraintFocus>;
  snapshots: ReturnType<typeof sampleSnapshots>;
  conserved: ReturnType<typeof sampleConservedParts> | null;
  clamp: ReturnType<typeof sampleConditionClamp> | null;
  trolleyPending: boolean;
  separation: number;
}
function observedCompatible(values: readonly FundsAmount[]): boolean {
  return (
    values.length > 0 &&
    values.every(
      (value) => fundsObserved(value) && compatibleQuantityBases(values[0].basis, value.basis),
    )
  );
}
function copiedAmount(value: FundsAmount): FundsAmount {
  return {
    ...value,
    amount: value.amount ? { ...value.amount } : null,
    source: { ...value.source },
    basis: { ...value.basis, source: { ...value.basis.source } },
  };
}
/** Seconds are beat clocks only. Every source amount/date/state stays literal and seekable. */
export function sampleFundsScene(scene: FundsScene, seconds: number): FundsPose {
  const time = Math.min(scene.resolveAt, Number.isFinite(seconds) ? seconds : scene.setupAt - 1);
  const clock: BusinessClock = { frame: time * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock),
    rows = fundsRows(scene);
  const pose: FundsPose = {
    time,
    opacity: phases.setup,
    holding: phases.holding,
    page: fundsPageAt(scene, time),
    sourceAmounts: fundsAmounts(scene).map(copiedAmount),
    folio: { open: phases.action, contributed: false },
    priorities: [],
    tierFills: [0, 0, 0, 0],
    focus: [],
    snapshots: [],
    conserved: null,
    clamp: null,
    trolleyPending: false,
    separation: 0,
  };
  switch (scene.preset) {
    case 'capital-states': {
      // M10 is an ordered inspection of distinct records, NOT a commitment-to-cash flow.
      pose.priorities = samplePriorityFill(
        clock,
        rows.slice(0, 4).map((row) => ({ id: row.id, amount: null, ceiling: null })),
      );
      pose.folio.open = pose.priorities.reduce((sum, item) => sum + item.reveal, 0) / 4;
      pose.folio.contributed =
        fundsObserved(scene.contributed) && scene.contributed.amount.minorUnits > 0;
      break;
    }
    case 'subscriptions-and-close':
      pose.focus = sampleConstraintFocus(
        clock,
        rows.map((row) => row.id),
        'uncalled',
      );
      pose.folio.open = pose.focus.find((item) => item.id === 'uncalled')?.focus ?? 0;
      break;
    case 'source-periods': {
      pose.snapshots = sampleSnapshots(
        clock,
        scene.periods.map((period) => ({ id: period.identity.id, date: period.date })),
      );
      const focused = pose.snapshots.find((snapshot) => snapshot.focused);
      const record = scene.periods.find((period) => period.identity.id === focused?.id);
      pose.folio.open = phases.action;
      pose.folio.contributed =
        record?.account === 'contributed' &&
        fundsObserved(record.value) &&
        record.value.amount.minorUnits > 0;
      break;
    }
    case 'stated-priority-tiers': {
      const complete = observedCompatible(fundsAmounts(scene));
      pose.priorities = samplePriorityFill(
        clock,
        scene.tiers.map((tier) => ({
          id: tier.identity.id,
          amount: complete ? (tier.allocation.amount?.minorUnits ?? null) : null,
          ceiling: complete ? (tier.ceiling.amount?.minorUnits ?? null) : null,
        })),
      );
      pose.tierFills = [
        pose.priorities[0]?.fill ?? 0,
        pose.priorities[1]?.fill ?? 0,
        pose.priorities[2]?.fill ?? 0,
        pose.priorities[3]?.fill ?? 0,
      ];
      break;
    }
    case 'gross-to-net': {
      const values = fundsAmounts(scene);
      if (observedCompatible(values) && fundsObserved(scene.gross))
        pose.conserved = sampleConservedParts(clock, scene.gross.amount.minorUnits, [
          ...scene.costs.map((cost) => ({
            id: cost.identity.id,
            amount: cost.amount.amount?.minorUnits ?? 0,
          })),
          { id: 'net', amount: scene.net.amount?.minorUnits ?? 0 },
          { id: 'remainder', amount: scene.remainder.amount?.minorUnits ?? 0 },
        ]);
      break;
    }
    case 'retained-follow-on-capital': {
      pose.clamp = sampleConditionClamp(
        clock,
        scene.allocated.state === 'source-stated'
          ? 'satisfied'
          : scene.allocated.state === 'negative' || scene.allocated.state === 'pending'
            ? 'blocked'
            : 'unknown',
      );
      pose.folio.open = pose.clamp.progress;
      if (
        observedCompatible(fundsAmounts(scene)) &&
        fundsObserved(scene.retained) &&
        scene.retained.amount.minorUnits > 0
      ) {
        const total = scene.retained.amount.minorUnits;
        pose.tierFills = [
          ((scene.allocated.amount?.minorUnits ?? 0) / total) * pose.clamp.gate,
          ((scene.remaining.amount?.minorUnits ?? 0) / total) * pose.clamp.gate,
          0,
          0,
        ];
      }
      break;
    }
    case 'periodic-repurchase': {
      const fulfilled =
        scene.requests.length > 0 &&
        scene.requests.every((request) => request.state === 'fulfilled');
      const blocked = scene.requests.some((request) => request.state === 'negative');
      pose.clamp = sampleConditionClamp(
        clock,
        fulfilled ? 'satisfied' : blocked ? 'blocked' : 'unknown',
      );
      pose.folio.open = pose.clamp.progress;
      pose.trolleyPending = scene.requests.some((request) => request.state !== 'fulfilled');
      break;
    }
    case 'valuation-cash-distinction':
      pose.focus = sampleConstraintFocus(
        clock,
        rows.map((row) => row.id),
        'cash',
      );
      pose.separation = pose.focus.find((item) => item.id === 'cash')?.focus ?? 0;
      break;
  }
  return pose;
}
