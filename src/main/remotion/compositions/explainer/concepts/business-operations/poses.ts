import type { MarketExchangeScene, ResourceAllocationScene, UnitEconomicsScene } from './types';

export type BusinessPoint = [number, number, number];

export function businessProgress(t: number, from: number, to: number): number {
  const p = Math.max(0, Math.min(1, (t - from) / Math.max(0.001, to - from)));
  return p * p * (3 - 2 * p);
}

function travel(from: BusinessPoint, to: BusinessPoint, p: number): BusinessPoint {
  return [
    from[0] + (to[0] - from[0]) * p,
    from[1] + (to[1] - from[1]) * p + Math.sin(p * Math.PI) * 0.28,
    from[2] + (to[2] - from[2]) * p,
  ];
}

/** One product and one payment; a fee is a partition of payment, not new money. */
export function marketExchangePose(scene: MarketExchangeScene, t: number) {
  const matched = scene.preset !== 'unmatched-market';
  const exchange = matched ? businessProgress(t, scene.actionAt, scene.responseAt) : 0;
  const settlement = scene.platform
    ? businessProgress(t, scene.responseAt, scene.checkAt)
    : exchange;
  const paid = scene.payment?.amount ?? 0;
  const fee = scene.platform?.fee ?? 0;
  const product = travel([-2.2, -0.05, 0.12], [2.2, -0.05, 0.12], exchange);
  const payment = scene.platform
    ? travel([2.2, -0.15, 1.15], [0, -0.15, 1.15], exchange)
    : travel([2.2, -0.15, 1.15], [-2.2, -0.15, 1.15], exchange);
  return {
    product,
    payment,
    sellerPayment: scene.platform
      ? travel([0, -0.15, 1.15], [-2.2, -0.15, 1.15], settlement)
      : payment,
    platformFee: travel([0, -0.15, 1.15], [0, -0.15, -0.65], settlement),
    exchange,
    settlement,
    owner: exchange === 1 ? ('buyer' as const) : ('seller' as const),
    buyerBalance: exchange === 0 ? paid : 0,
    inTransit: exchange > 0 && (exchange < 1 || settlement < 1) ? paid : 0,
    sellerBalance: settlement === 1 ? Math.round((paid - fee) * 100) / 100 : 0,
    platformBalance: scene.platform && settlement === 1 ? fee : 0,
    showSplit: Boolean(scene.platform && exchange === 1),
    unmatched: !matched,
  };
}

/** Payment status is not an account balance. Never label an in-flight parcel as held. */
export function marketExchangeLabels(scene: MarketExchangeScene, t: number): string[] {
  const pose = marketExchangePose(scene, t);
  const payment = scene.payment;
  const sellerStatus =
    pose.unmatched || pose.exchange === 0
      ? scene.product
      : pose.settlement === 1
        ? `received ${pose.sellerBalance} ${payment?.unit ?? ''}`
        : 'payment in transit';
  const buyerStatus = pose.unmatched
    ? 'unmatched'
    : pose.exchange === 1
      ? scene.product
      : pose.exchange === 0
        ? 'payment ready'
        : 'sending payment';
  if (scene.platform) return [scene.seller.label, scene.platform.label, scene.buyer.label];
  return [`${scene.seller.label} · ${sellerStatus}`, `${scene.buyer.label} · ${buyerStatus}`];
}

export function marketExchangeStatus(scene: MarketExchangeScene, t: number): string {
  const pose = marketExchangePose(scene, t);
  if (pose.unmatched) return `${scene.product} stays with seller · no payment`;
  if (pose.exchange === 0) return `Seller holds ${scene.product} · payment ready`;
  if (pose.exchange < 1) return `${scene.product} and payment in transit`;
  if (pose.settlement < 1) return `Buyer holds ${scene.product} · seller payment in transit`;
  return scene.platform
    ? `Payment received: seller ${pose.sellerBalance} · fee ${scene.platform.fee} ${scene.payment?.unit}`
    : `Buyer holds ${scene.product} · payment received`;
}

export type AllocationOwner = 'project-0' | 'project-1' | 'reserve';
export function allocationSlot(owner: AllocationOwner, index: number): BusinessPoint {
  const x = owner === 'project-0' ? -2 : owner === 'project-1' ? 2 : 0;
  return [
    x + ((index % 3) - 1) * 0.45,
    -0.02 + Math.floor(index / 6) * 0.13,
    0.15 + Math.floor((index % 6) / 3) * 0.48,
  ];
}

/** Keep every carrier's ID and all incumbents that still fit; only surplus tickets move. */
export function resourceAllocationPose(scene: ResourceAllocationScene, t: number) {
  const [a, b] = scene.projects;
  const before: AllocationOwner[] = Array.from({ length: scene.total }, (_, i) =>
    i < a.before ? 'project-0' : i < a.before + b.before ? 'project-1' : 'reserve',
  );
  const targets: AllocationOwner[] = [...before];
  const kept = { 'project-0': 0, 'project-1': 0, reserve: 0 };
  const wanted = {
    'project-0': a.after,
    'project-1': b.after,
    reserve: scene.total - a.after - b.after,
  };
  const free: number[] = [];
  before.forEach((owner, index) => {
    if (kept[owner] < wanted[owner]) kept[owner]++;
    else free.push(index);
  });
  for (const owner of ['project-0', 'project-1', 'reserve'] as const) {
    while (kept[owner] < wanted[owner]) {
      const index = free.shift();
      if (index === undefined) throw new Error('Invalid non-conserving allocation');
      targets[index] = owner;
      kept[owner]++;
    }
  }
  const beforeSlots = { 'project-0': 0, 'project-1': 0, reserve: 0 };
  const afterSlots = { 'project-0': 0, 'project-1': 0, reserve: 0 };
  const progress = businessProgress(t, scene.actionAt, scene.responseAt);
  const tickets = before.map((from, i) => {
    const to = targets[i] ?? 'reserve';
    const start = allocationSlot(from, beforeSlots[from]++);
    const end = allocationSlot(to, afterSlots[to]++);
    return {
      id: `capacity-${i}`,
      from,
      to,
      owner: progress === 1 ? to : from,
      moving: from !== to && progress > 0 && progress < 1,
      position: from === to ? end : travel(start, end, progress),
    };
  });
  return {
    tickets,
    progress,
    projects: scene.projects.map((project) => ({
      id: project.id,
      assigned: tickets.filter((ticket) => ticket.owner === project.id).length,
      requested: project.requested,
      unmet: t >= scene.checkAt ? Math.max(0, project.requested - project.after) : 0,
    })),
    showRequests: t >= scene.actionAt,
    showUnmet: scene.preset === 'constrained-projects' && t >= scene.checkAt,
  };
}

/** Geometric scale is source amounts, not an invented number of coins. */
export function unitEconomicsPose(scene: UnitEconomicsScene, t: number) {
  const totalCost = scene.costs.reduce((sum, cost) => sum + Math.round(cost.amount * 100), 0) / 100;
  const denominator = Math.max(scene.revenue, totalCost);
  const split = businessProgress(t, scene.actionAt, scene.responseAt);
  const costs = scene.costs.map((cost, index) => {
    const x = scene.costs.length === 1 ? 0 : -1.75 + (index * 3.5) / (scene.costs.length - 1);
    return {
      ...cost,
      position: travel([-2.6, 0.1, -0.55], [x, -0.02, 0.4], split),
      width: (cost.amount / denominator) * 4.4,
    };
  });
  return {
    split,
    costs,
    totalCost,
    fundedCost: Math.min(totalCost, scene.revenue),
    revenueWidth: (scene.revenue / denominator) * 4.4,
    costWidth: (totalCost / denominator) * 4.4,
    remainder: scene.remainder,
    remainderWidth: (Math.abs(scene.remainder) / denominator) * 4.4,
    showComparison: t >= scene.checkAt,
    retained: Math.max(0, scene.remainder),
    shortfall: Math.max(0, -scene.remainder),
    status:
      scene.remainder > 0
        ? ('remainder' as const)
        : scene.remainder < 0
          ? ('shortfall' as const)
          : ('break-even' as const),
  };
}
