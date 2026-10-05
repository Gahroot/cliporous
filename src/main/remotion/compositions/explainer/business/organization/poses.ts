import { diagramPose } from '../../diagrams/motion';
import {
  type BusinessClock,
  businessPhases,
  sampleConservedParts,
  sampleConstraintFocus,
  sampleHandshake,
  sampleProvenance,
  sampleScaleLens,
  sampleSnapshots,
} from '../motion';
import {
  type OrganizationPresentation,
  organizationPageAt,
  organizationPresentation,
} from './presentation';
import type { OrganizationScene } from './types';

interface PoseBase {
  time: number;
  opacity: number;
  inspection: number;
  pageIndex: number;
  presentation: OrganizationPresentation;
}
export type OrganizationPose = PoseBase &
  (
    | { preset: 'federated-units'; motionId: 'M-07'; lens: ReturnType<typeof sampleScaleLens> }
    | {
        preset: 'decision-rights';
        motionId: 'M-09';
        rights: readonly {
          id: string;
          unitId: string;
          permission: string;
          cardState: 'allowed' | 'denied' | 'unknown';
          handshake: ReturnType<typeof sampleHandshake>;
        }[];
      }
    | {
        preset: 'rollout-rings';
        motionId: 'M-06';
        snapshots: readonly (ReturnType<typeof sampleSnapshots>[number] & { state: string })[];
      }
    | {
        preset: 'legacy-boundaries';
        motionId: 'M-03';
        connected: false;
        focus: ReturnType<typeof sampleConstraintFocus>;
      }
    | {
        preset: 'stated-chargeback';
        motionId: 'M-02';
        conserved: ReturnType<typeof sampleConservedParts>;
        remainderAmount: number | null;
      }
    | {
        preset: 'declared-tool-boundaries';
        motionId: 'M-03';
        focus: ReturnType<typeof sampleConstraintFocus>;
      }
    | {
        preset: 'merge-identities';
        motionId: 'M-11';
        ownerId: string;
        pending: true;
        provenance: ReturnType<typeof sampleProvenance>;
      }
  );

/** Pure authored samples: no labels, state, amounts or identities are interpolated or completed. */
export function sampleOrganizationScene(
  scene: OrganizationScene,
  seconds: number,
): OrganizationPose {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(scene.resolveAt, seconds)) : 0;
  const clock: BusinessClock = { frame: time * 30, fps: 30, beats: scene };
  const common: PoseBase = {
    time,
    opacity: diagramPose(time, scene).setup,
    inspection: businessPhases(clock).action,
    pageIndex: organizationPageAt(scene, time),
    presentation: organizationPresentation(scene),
  };
  switch (scene.preset) {
    case 'federated-units':
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-07',
        lens: sampleScaleLens(
          clock,
          scene.units.map((unit) => unit.id),
        ),
      };
    case 'decision-rights':
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-09',
        rights: scene.rights.map((right) => ({
          id: right.decision.id,
          unitId: right.unitId,
          permission: right.permission,
          cardState:
            right.permission === 'permitted'
              ? 'allowed'
              : right.permission === 'denied'
                ? 'denied'
                : 'unknown',
          handshake: sampleHandshake(
            clock,
            right.permission === 'permitted'
              ? 'approved'
              : right.permission === 'denied'
                ? 'denied'
                : 'pending',
          ),
        })),
      };
    case 'rollout-rings': {
      const snapshots = sampleSnapshots(
        clock,
        scene.rings.map((ring) => ({ id: ring.unit.id, date: ring.date })),
      );
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-06',
        snapshots: snapshots.map((snapshot, index) => ({
          ...snapshot,
          state: scene.rings[index].state,
        })),
      };
    }
    case 'legacy-boundaries':
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-03',
        connected: false,
        focus: sampleConstraintFocus(
          clock,
          [scene.legacy.id, scene.interface.id, scene.replacement.id],
          scene.interface.id,
        ),
      };
    case 'stated-chargeback': {
      const parts = scene.allocations.map((allocation) => ({
        id: allocation.unitId,
        amount: allocation.amount.minorUnits,
      }));
      if (scene.remainder.amount !== null)
        parts.push({ id: 'remainder', amount: scene.remainder.amount.minorUnits });
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-02',
        conserved: sampleConservedParts(clock, scene.total.amount.minorUnits, parts),
        remainderAmount: scene.remainder.amount?.minorUnits ?? null,
      };
    }
    case 'declared-tool-boundaries':
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-03',
        focus: sampleConstraintFocus(
          clock,
          scene.tools.map((tool) => tool.identity.id),
          scene.tools.find((tool) => tool.state !== 'allowed')?.identity.id ??
            scene.tools[0].identity.id,
        ),
      };
    case 'merge-identities':
      return {
        ...common,
        preset: scene.preset,
        motionId: 'M-11',
        ownerId: scene.owner.id,
        pending: true,
        provenance: sampleProvenance(
          clock,
          scene.records.map((record) => record.identity.id),
        ),
      };
  }
}
