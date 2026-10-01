import type {
  BusinessPopulationsScene,
  CustomerCohortScene,
  InventoryDemandScene,
  PopulationDistributionScene,
} from './types';

export type PopulationPoint = [number, number, number];
/** Authored envelope includes shelves, hats and moving carriers; no model-controlled geometry. */
export const POPULATION_ENVELOPE = { x: [-2.85, 2.85], y: [-1.35, 1.15], z: [-1.35, 1.3] } as const;
export const POPULATION_MESH_BUDGET = {
  'customer-concentration': 260,
  'workload-spread': 260,
  'average-hides-tail': 270,
  retention: 140,
  churn: 140,
  surplus: 180,
  shortage: 180,
  balanced: 180,
} as const;

function progress(t: number, start: number, end: number): number {
  const p = Math.max(0, Math.min(1, (t - start) / Math.max(0.001, end - start)));
  return p * p * (3 - 2 * p);
}
function move(from: PopulationPoint, to: PopulationPoint, p: number, lift = 0): PopulationPoint {
  return [
    from[0] + (to[0] - from[0]) * p,
    from[1] + (to[1] - from[1]) * p + Math.sin(p * Math.PI) * lift,
    from[2] + (to[2] - from[2]) * p,
  ];
}
export function memberX(index: number, count: number): number {
  return (index - (count - 1) / 2) * (count === 4 ? 1.35 : 1.65);
}
export function distributionPose(scene: PopulationDistributionScene, t: number) {
  const counts = scene.members.map((m) => m.amount ?? { low: 1, middle: 2, high: 3 }[m.level]);
  let serial = 0;
  const carriers = scene.members.flatMap((member, index) =>
    Array.from({ length: counts[index] ?? 0 }, (_, n) => {
      const order = serial++;
      const start: PopulationPoint = [
        ((order % 6) - 2.5) * 0.7,
        -1.04 + Math.floor(order / 6) * 0.11,
        1.0,
      ];
      const target: PopulationPoint = [memberX(index, scene.members.length), -0.91 + n * 0.16, 0.1];
      const at = scene.actionAt + index * 0.12 + n * 0.06;
      const p = progress(t, at, scene.checkAt - 0.15);
      return {
        id: `${member.id}-work-${n}`,
        ownerId: member.id,
        identity: index,
        position: move(start, target, p, 0.5),
        rotation: -Math.PI / 2,
        delivered: p === 1,
      };
    }),
  );
  return {
    members: scene.members.map((member, index) => ({
      ...member,
      identity: index,
      position: [memberX(index, scene.members.length), -0.95, -0.8] as PopulationPoint,
    })),
    carriers,
    average: {
      visible: scene.preset === 'average-hides-tail' && t >= scene.checkAt,
      reveal: progress(t, scene.checkAt, scene.resolveAt),
      y: -0.99 + (scene.average ?? counts.reduce((a, b) => a + b, 0) / counts.length) * 0.16,
    },
    compared: t >= scene.checkAt,
  };
}

/** Original IDs never change; newcomers never share the retained lane or retained set. */
export function cohortPose(scene: CustomerCohortScene, t: number) {
  const laneCounts = { retained: 0, departed: 0 };
  const members = scene.members.map((member, index) => {
    const slot = laneCounts[member.status]++;
    const start: PopulationPoint = [
      -2.0 + (index % 3) * 0.68,
      -1.12,
      -0.55 + Math.floor(index / 3) * 0.8,
    ];
    const target: PopulationPoint = [
      member.status === 'retained' ? -1.5 + (slot % 3) * 0.65 : 0.65 + (slot % 3) * 0.65,
      -1.12,
      -0.45 + Math.floor(slot / 3) * 0.8,
    ];
    const startAt = member.status === 'retained' ? scene.actionAt : scene.responseAt;
    const p = progress(t, startAt + index * 0.04, scene.checkAt - 0.1);
    return {
      ...member,
      identity: index,
      position: move(start, target, p),
      lane: p === 1 ? member.status : ('original' as const),
    };
  });
  const arrivals = scene.arrivals.map((member, index) => ({
    ...member,
    identity: scene.members.length + index,
    lane: 'arrival' as const,
    position: move(
      [2.25, -1.12, -1.05 + index * 0.75],
      [-0.3 + index * 0.7, -1.12, 1.0],
      progress(t, scene.checkAt + index * 0.05, scene.resolveAt),
    ),
  }));
  return {
    members,
    arrivals,
    laterPeriod: t >= scene.actionAt,
    separated: t >= scene.checkAt,
    retainedIds: scene.members
      .filter((member) => member.status === 'retained')
      .map((member) => member.id),
    departedIds: scene.members
      .filter((member) => member.status === 'departed')
      .map((member) => member.id),
  };
}

export function shelfSlot(index: number): PopulationPoint {
  return [-2.05 + (index % 3) * 0.55, -0.84 + Math.floor(index / 3) * 0.74, -0.52];
}
export function demandSlot(index: number): PopulationPoint {
  return [0.45 + (index % 3) * 0.7, -1.15, -0.65 + Math.floor(index / 3) * 1.0];
}
/** Each stock actor is moved once, never copied into its customer's hands. */
export function inventoryPose(scene: InventoryDemandScene, t: number) {
  const matches = Math.min(scene.stock.length, scene.demand.length);
  const people = scene.demand.map((actor, index) => {
    const target = demandSlot(index);
    return {
      ...actor,
      identity: index,
      position: move(
        [target[0] + 0.25, target[1], target[2] - 0.25],
        target,
        progress(t, scene.actionAt, scene.responseAt),
      ),
      matchedStockId: index < matches ? scene.stock[index]?.id : undefined,
      fulfilled: index < matches && t >= scene.checkAt,
    };
  });
  const products = scene.stock.map((actor, index) => {
    const customer = people[index];
    const p = customer ? progress(t, scene.responseAt + index * 0.04, scene.checkAt) : 0;
    const target: PopulationPoint = customer
      ? [customer.position[0], -0.66, customer.position[2] + 0.28]
      : shelfSlot(index);
    return {
      ...actor,
      identity: index,
      position: move(shelfSlot(index), target, p, 0.6),
      demandId: customer?.id,
      location: p === 1 ? ('customer' as const) : p > 0 ? ('moving' as const) : ('shelf' as const),
    };
  });
  return {
    products,
    people,
    matches,
    leftover: scene.stock.length - matches,
    unmet: scene.demand.length - matches,
    checked: t >= scene.checkAt,
  };
}
export function businessPopulationsPose(scene: BusinessPopulationsScene, t: number) {
  switch (scene.kind) {
    case 'population-distribution':
      return distributionPose(scene, t);
    case 'customer-cohort':
      return cohortPose(scene, t);
    case 'inventory-demand':
      return inventoryPose(scene, t);
  }
}
