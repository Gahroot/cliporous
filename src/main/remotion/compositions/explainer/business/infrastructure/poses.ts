import { diagramPose } from '../../diagrams/motion';
import {
  type BusinessClock,
  businessPhases,
  sampleConditionClamp,
  sampleConservedParts,
  sampleConstraintFocus,
  sampleHandshake,
  sampleProvenance,
  sampleSnapshots,
} from '../motion';
import type { BusinessAssetId } from '../types';
import {
  infrastructureIdentities,
  infrastructurePageIndex,
  infrastructureRows,
} from './presentation';
import type {
  InfrastructureQuantity,
  InfrastructureScene,
  InfrastructureState,
  ProviderTransitionScene,
} from './types';

export interface InfrastructurePose {
  setup: number;
  response: number;
  diagram: ReturnType<typeof diagramPose>;
  page: number;
  identities: { id: string; key: string; position: [number, number, number]; scale: number }[];
  shares: { id: string; value: number | null; state: InfrastructureState; weight: number }[];
  clamp: ReturnType<typeof sampleConditionClamp>;
  readiness: { money: boolean; power: boolean; cooling: boolean } | null;
  queue: { queued: number | null; capacity: number | null; observed: boolean } | null;
  transition: {
    sourceState: ProviderTransitionScene['transition']['state'];
    connected: boolean;
    motion: ReturnType<typeof sampleHandshake>;
  } | null;
  trace: ReturnType<typeof sampleProvenance>;
  snapshots: ReturnType<typeof sampleSnapshots>;
  latency: ReturnType<typeof sampleConservedParts> | null;
  focus: ReturnType<typeof sampleConstraintFocus>;
}

export function infrastructureKey(scene: InfrastructureScene, role: string, id: string): string {
  return `infrastructure:${scene.kind}:${scene.preset}:${role}:${id}`;
}
export function infrastructureRecipeId(scene: InfrastructureScene): string {
  return {
    'installed-used-reserved': 'OP-35',
    'evidence-and-missing-information': 'OP-63',
    'physical-readiness': 'OP-65',
    'bounded-request-capacity': 'OP-66',
    'resource-states': 'OP-67',
    'declared-processing-scope': 'OP-68',
    'provider-transition': 'OP-69',
    'versioned-provenance': 'OP-70',
    'evaluation-periods': 'OP-71',
    'end-to-end-periods': 'OP-72',
  }[scene.preset];
}
/** Frozen catalog assemblies require their separately validated native source clause. */
export function infrastructureAssets(
  scene: InfrastructureScene,
): { id: string; asset: BusinessAssetId }[] {
  if (scene.modelSource == null) return [];
  switch (scene.preset) {
    case 'installed-used-reserved':
    case 'bounded-request-capacity':
      return [{ id: scene.resource.id, asset: 'A-13' }];
    case 'physical-readiness':
      return [
        { id: scene.resource.id, asset: 'A-13' },
        { id: scene.power.id, asset: 'A-14' },
        { id: scene.cooling.id, asset: 'A-15' },
      ];
    case 'resource-states':
      return [
        { id: scene.resource.id, asset: 'A-13' },
        { id: scene.cooling.id, asset: 'A-15' },
      ];
    case 'declared-processing-scope':
    case 'provider-transition':
      return [{ id: scene.resource.id, asset: 'A-16' }];
    case 'evidence-and-missing-information':
      return [{ id: scene.owner.id, asset: 'A-07' }];
    case 'versioned-provenance': {
      const entry = scene.entries[0];
      return [
        { id: scene.owner.id, asset: 'A-07' },
        ...(entry ? [{ id: entry.identity.id, asset: 'A-16' as const }] : []),
      ];
    }
    case 'evaluation-periods':
      return [];
    case 'end-to-end-periods':
      return [{ id: scene.resource.id, asset: 'A-16' }];
  }
}
function observed(q: InfrastructureQuantity): boolean {
  return q.state === 'source-stated' && q.value !== null && q.basis !== null;
}
/** Pure poses change inspection/visibility, not immutable measurements, dates, versions or states. */
export function sampleInfrastructure(
  scene: InfrastructureScene,
  seconds: number,
): InfrastructurePose {
  const clock: BusinessClock = { frame: seconds * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock),
    rows = infrastructureRows(scene);
  // Source presentation boundaries are exact seconds, not a frames/seconds round trip.
  const time = Number.isFinite(seconds) ? seconds : 0;
  const shares: InfrastructurePose['shares'] = [];
  let clampState: 'satisfied' | 'blocked' | 'unknown' = 'unknown';
  if (scene.preset === 'installed-used-reserved' || scene.preset === 'resource-states') {
    const allocations =
      scene.preset === 'installed-used-reserved'
        ? [
            { id: 'used', q: scene.used },
            { id: 'reserved', q: scene.reserved },
          ]
        : [
            { id: 'idle', q: scene.idle },
            { id: 'reserved', q: scene.reserved },
            { id: 'burst', q: scene.burst },
          ];
    for (const { id, q } of allocations)
      shares.push({
        id,
        value: q.value,
        state: q.state,
        weight:
          observed(scene.installed) && observed(q) && (scene.installed.value ?? 0) > 0
            ? ((q.value ?? 0) / (scene.installed.value ?? 1)) * phases.action
            : 0,
      });
    if (observed(scene.installed) && allocations.every(({ q }) => observed(q)))
      clampState = 'satisfied';
  }
  const readiness =
    scene.preset === 'physical-readiness'
      ? {
          money: scene.moneyReady.state === 'source-stated',
          power: scene.powerReady.state === 'source-stated',
          cooling: scene.coolingReady.state === 'source-stated',
        }
      : null;
  if (readiness)
    clampState =
      readiness.money && readiness.power && readiness.cooling
        ? 'satisfied'
        : [
              scene.preset === 'physical-readiness' ? scene.moneyReady.state : '',
              scene.preset === 'physical-readiness' ? scene.powerReady.state : '',
              scene.preset === 'physical-readiness' ? scene.coolingReady.state : '',
            ].includes('negative')
          ? 'blocked'
          : 'unknown';
  const queue =
    scene.preset === 'bounded-request-capacity'
      ? {
          queued: scene.queued.value,
          capacity: scene.capacity.value,
          observed: observed(scene.queued) && observed(scene.capacity),
        }
      : null;
  if (queue?.observed)
    clampState = (queue.queued ?? 0) <= (queue.capacity ?? 0) ? 'satisfied' : 'blocked';
  const transition =
    scene.preset === 'provider-transition'
      ? {
          sourceState: scene.transition.state,
          connected: scene.transition.state === 'completed',
          motion: sampleHandshake(
            clock,
            scene.transition.state === 'completed'
              ? 'approved'
              : scene.transition.state === 'blocked'
                ? 'denied'
                : 'pending',
          ),
        }
      : null;
  const traceIds =
    scene.preset === 'versioned-provenance'
      ? scene.edges.map((e) => `${e.fromId}:${e.toId}`)
      : scene.preset === 'evidence-and-missing-information'
        ? scene.items.map((i) => `${i.entry.identity.id}:${i.entry.version}`)
        : [];
  const trace = sampleProvenance(clock, traceIds).map((pose, index) => ({
    ...pose,
    linkProgress:
      (scene.preset === 'versioned-provenance'
        ? scene.edges[index]?.state
        : scene.preset === 'evidence-and-missing-information'
          ? scene.items[index]?.fact.state
          : '') === 'source-stated'
        ? pose.linkProgress
        : 0,
  }));
  const snapshots =
    scene.preset === 'evaluation-periods'
      ? sampleSnapshots(
          clock,
          scene.snapshots.map((s) => ({
            id: `${scene.owner.id}:${s.version}:${s.date}`,
            date: s.date,
          })),
        )
      : [];
  const latency =
    scene.preset === 'end-to-end-periods' &&
    scene.aggregation.state === 'sequential' &&
    observed(scene.total) &&
    scene.stages.every((s) => observed(s.quantity))
      ? sampleConservedParts(
          clock,
          scene.total.value ?? 0,
          scene.stages.map((s) => ({ id: s.identity.id, amount: s.quantity.value ?? 0 })),
        )
      : null;
  const assets = infrastructureAssets(scene);
  const identities = infrastructureIdentities(scene).map<InfrastructurePose['identities'][number]>(
    (identity, index) => {
      const assetIndex = assets.findIndex((asset) => asset.id === identity.id);
      return {
        id: identity.id,
        key: infrastructureKey(scene, 'identity', identity.id),
        position:
          assetIndex >= 0
            ? [
                (assetIndex - (assets.length - 1) / 2) * (assets.length === 3 ? 2.15 : 2.65),
                0,
                -0.2,
              ]
            : [(index - (infrastructureIdentities(scene).length - 1) / 2) * 0.6, 1.15, 0.85],
        scale:
          assetIndex >= 0 ? (assets.length === 3 ? 0.55 : assets.length === 2 ? 0.68 : 0.82) : 0.32,
      };
    },
  );
  return {
    setup: phases.setup,
    response: phases.response,
    diagram: { ...diagramPose(time, scene), resolve: time >= scene.resolveAt ? 1 : 0 },
    page: infrastructurePageIndex(scene, time),
    identities,
    shares,
    clamp: sampleConditionClamp(clock, clampState),
    readiness,
    queue,
    transition,
    trace,
    snapshots,
    latency,
    focus: sampleConstraintFocus(
      clock,
      rows.map((row) => row.id),
      rows.find((row) =>
        ['negative', 'pending', 'conditional', 'unknown', 'blocked'].includes(row.state),
      )?.id ?? '',
    ),
  };
}
