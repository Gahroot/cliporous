import { diagramPose } from '../../diagrams/motion';
import {
  type BusinessClock,
  businessPhases,
  sampleAlternatives,
  sampleConditionClamp,
  sampleConstraintFocus,
  sampleHandshake,
  sampleScaleLens,
} from '../motion';
import type { BusinessAssetId } from '../types';
import { marketsIdentities, marketsPageIndex, marketsRows } from './presentation';
import type { MarketsScene } from './types';

/** Source IDs never collide with other recipes or with factual row IDs. */
export function marketsKey(scene: MarketsScene, category: string, id: string): string {
  return `markets:${scene.kind}:${scene.preset}:${category}:${id}`;
}
export function marketsRecipeId(scene: MarketsScene): string {
  if (scene.kind === 'procurement-commitment') return 'OP-47';
  return {
    'channel-concentration': 'OP-24',
    'demand-access': 'OP-41',
    'migration-constraints': 'OP-42',
    'participation-matching': 'OP-43',
    'stated-participation-benefit': 'OP-44',
    'differentiated-offering': 'OP-45',
    'supplier-distribution-boundaries': 'OP-46',
    'complementary-specialists': 'OP-48',
  }[scene.preset];
}

/** An asset is bound to a supported identity; its architecture remains illustrative. */
export function marketsAssets(scene: MarketsScene): { id: string; asset: BusinessAssetId }[] {
  if (scene.kind === 'procurement-commitment')
    return [
      { id: scene.task.id, asset: 'A-05' },
      // A-06 contains a literal approver occupant. Never mount it for an unknown actor.
      ...(scene.roles.approver.actorId === null
        ? []
        : [{ id: scene.roles.approver.actorId, asset: 'A-06' as const }]),
    ];
  switch (scene.preset) {
    case 'stated-participation-benefit':
      return [];
    case 'channel-concentration':
    case 'demand-access':
    case 'differentiated-offering':
      return [{ id: scene.business.id, asset: 'A-01' }];
    case 'migration-constraints':
    case 'supplier-distribution-boundaries':
      return [{ id: scene.business.id, asset: 'A-16' }];
    case 'participation-matching':
      return [{ id: scene.business.id, asset: 'A-02' }];
    case 'complementary-specialists':
      return scene.specialists.map((s) => ({ id: s.identity.id, asset: 'A-02' }));
  }
}

/** Frame-seekable authored poses. No source fact, amount, baseline or state is interpolated. */
export function sampleMarkets(scene: MarketsScene, seconds: number) {
  const clock: BusinessClock = { frame: seconds * 30, fps: 30, beats: scene };
  const phases = businessPhases(clock);
  const rows = marketsRows(scene);
  const identityIds = marketsIdentities(scene).map((i) => i.id);
  const specialistIds =
    scene.kind === 'market-dependency' && scene.preset === 'complementary-specialists'
      ? scene.specialists.map((s) => s.identity.id)
      : [];
  const lens = sampleScaleLens(clock, specialistIds);
  const offeringIds =
    scene.kind === 'market-dependency' && scene.preset === 'differentiated-offering'
      ? scene.offerings.map((o) => o.identity.id)
      : [];
  const alternatives = sampleAlternatives(clock, offeringIds);
  const constraints = sampleConstraintFocus(
    clock,
    rows.map((r) => r.id),
    rows.find((r) => !['source-stated', 'satisfied'].includes(r.state))?.id ?? '',
  );
  const migration =
    scene.kind === 'market-dependency' && scene.preset === 'migration-constraints'
      ? sampleConditionClamp(
          clock,
          scene.migration.state === 'completed' &&
            scene.constraints.every((c) => c.state === 'satisfied')
            ? 'satisfied'
            : scene.migration.state === 'unknown'
              ? 'unknown'
              : 'blocked',
        )
      : null;
  const matches =
    scene.kind === 'market-dependency' && scene.preset === 'participation-matching'
      ? scene.matches.map((m) => ({
          id: marketsKey(scene, 'match', `${m.leftId}:${m.rightId}`),
          leftId: m.leftId,
          rightId: m.rightId,
          state: m.state,
          // Matching and acceptance are independent facts, never a sale or settlement.
          matching: m.state === 'matched' ? phases.response : 0,
          acceptance: sampleHandshake(
            clock,
            m.acceptance.state === 'accepted' ? 'approved' : 'pending',
          ),
          acceptanceState: m.acceptance.state,
        }))
      : [];
  const procurement =
    scene.kind === 'procurement-commitment'
      ? {
          quote: { state: scene.quote.state, amount: scene.quote.amount, basis: scene.quote.basis },
          payment: {
            state: scene.payment.state,
            amount: scene.payment.amount,
            basis: scene.payment.basis,
          },
          authority: sampleHandshake(
            clock,
            scene.authority.state === 'granted' ? 'approved' : 'pending',
          ),
          authorityState: scene.authority.state,
          acceptance: sampleHandshake(
            clock,
            scene.acceptance.state === 'accepted' ? 'approved' : 'pending',
          ),
          acceptanceState: scene.acceptance.state,
          settlement: scene.payment.state === 'paid' ? phases.check : 0,
        }
      : null;
  const ids = identityIds.map((id, index) => {
    const local = lens.units.find((u) => u.id === id);
    const alternative = alternatives.find((a) => a.id === id);
    return {
      id,
      key: marketsKey(scene, 'identity', id),
      x: local ? local.x * 1.8 : (index - (identityIds.length - 1) / 2) * 0.7,
      y: 0,
      scale: local?.scale ?? 1,
      area: alternative?.area ?? 1,
      baseline: alternative?.baseline ?? 0,
    };
  });
  return {
    setup: phases.setup,
    inspection: phases.response,
    // The source resolve clause appears exactly at its indexed beat, then holds.
    // Keep the legacy model/diagram handoff; do not move beats or fade into the final hold.
    diagram: {
      ...diagramPose(phases.time, scene),
      resolve: phases.time >= scene.resolveAt ? 1 : 0,
    },
    page: marketsPageIndex(scene, phases.time),
    identities: ids,
    constraints,
    alternatives,
    lens: lens.lens,
    migration,
    matches,
    procurement,
  };
}
