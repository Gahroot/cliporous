import { contactOffset, phaseProgress, type TechnologyPoint, travelPoint } from './motion';
import type { SoftwareReleaseScene } from './types';

/** A single change is clamped above the test gates, then crosses their joined stop bar. */
export const SOFTWARE_RELEASE_WORKBENCH = {
  input: { x: 432, y: 230 },
  testDock: { x: 432, y: 330 },
  release: { x: 432, y: 664 },
  prior: { x: 766, y: 664 },
  singleGate: { x: 434, y: 446 },
  parallelGates: [
    { x: 318, y: 446 },
    { x: 670, y: 446 },
  ],
} as const;

type CheckStatus = 'waiting' | 'active' | 'possible' | 'passed' | 'blocked';

export interface SoftwareReleasePose {
  change: TechnologyPoint;
  changeStatus: CheckStatus;
  previousVersion: TechnologyPoint;
  dockRecoil: number;
  checks: {
    position: TechnologyPoint;
    status: CheckStatus;
    open: number;
    receipt: TechnologyPoint;
    receiptVisible: boolean;
    receiptArrived: boolean;
  }[];
  joinOpen: number;
  /** Verified readiness only; hypothetical receipts can still open the illustrated path. */
  joinReady: boolean;
  joinRecoil: number;
  blocked: boolean;
  released: boolean;
  restored: boolean;
  outcomeOpacity: number;
}

/** Pure absolute-second sampling. No state, frame integration, timers or idle motion. */
export function softwareReleasePose(
  scene: SoftwareReleaseScene,
  timeSeconds: number,
): SoftwareReleasePose {
  const t = Number.isFinite(timeSeconds) ? timeSeconds : scene.setupAt - 1;
  const parallel = scene.preset === 'parallel-release';
  const rollback = scene.preset === 'regression-rollback';
  const conditional = Boolean(scene.condition);
  const gates = parallel
    ? SOFTWARE_RELEASE_WORKBENCH.parallelGates
    : [SOFTWARE_RELEASE_WORKBENCH.singleGate];
  // Two independent pass receipts must physically seat before the common latch opens.
  const joinAt = scene.checkAt + (parallel ? 0.3 : 0);
  const releaseContact = scene.resolveAt - 0.3;
  const checks = gates.map((position, index) => {
    const passAt = index === 0 ? scene.responseAt : scene.checkAt;
    const receiptAt = parallel ? passAt + 0.3 : joinAt;
    const resultReached = !rollback && t >= passAt;
    const status: CheckStatus =
      t < scene.actionAt
        ? 'waiting'
        : t < passAt
          ? 'active'
          : conditional
            ? 'possible'
            : rollback
              ? 'blocked'
              : 'passed';
    return {
      position,
      status,
      open: rollback ? 0 : phaseProgress(t, passAt, passAt + 0.2),
      receipt: travelPoint(
        t,
        passAt + 0.2,
        receiptAt,
        { x: position.x + 110, y: 605 },
        { x: parallel ? (index === 0 ? 518 : 570) : 544, y: 640 },
      ),
      // Receipt contact is progression, not verification of a conditional check.
      receiptVisible: resultReached && t >= passAt + 0.2,
      receiptArrived: resultReached && t >= receiptAt,
    };
  });
  const receiptsSeated = !rollback && checks.every((check) => check.receiptArrived);
  const joinReady = !conditional && receiptsSeated;
  const moveAt = joinAt + 0.2;
  const change =
    !rollback && t > moveAt
      ? travelPoint(
          t,
          moveAt,
          releaseContact,
          SOFTWARE_RELEASE_WORKBENCH.testDock,
          SOFTWARE_RELEASE_WORKBENCH.release,
        )
      : travelPoint(
          t,
          scene.setupAt,
          scene.actionAt,
          SOFTWARE_RELEASE_WORKBENCH.input,
          SOFTWARE_RELEASE_WORKBENCH.testDock,
        );
  const blocked = rollback && t >= scene.responseAt;
  return {
    change,
    changeStatus: blocked
      ? conditional
        ? 'possible'
        : 'blocked'
      : t >= (parallel ? scene.checkAt : scene.responseAt)
        ? conditional
          ? 'possible'
          : 'passed'
        : t >= scene.actionAt
          ? 'active'
          : 'waiting',
    previousVersion: rollback
      ? travelPoint(
          t,
          scene.checkAt + 0.2,
          releaseContact,
          SOFTWARE_RELEASE_WORKBENCH.prior,
          SOFTWARE_RELEASE_WORKBENCH.release,
        )
      : SOFTWARE_RELEASE_WORKBENCH.prior,
    dockRecoil: contactOffset(t, scene.actionAt, 4),
    checks,
    joinOpen: receiptsSeated ? phaseProgress(t, joinAt, joinAt + 0.15) : 0,
    joinReady,
    joinRecoil: rollback ? 0 : contactOffset(t, joinAt, 3),
    blocked: !conditional && blocked,
    released: !rollback && joinReady && t >= releaseContact,
    restored: !conditional && rollback && t >= releaseContact,
    // Contact precedes the reveal; the whole pose is exactly static at resolveAt.
    outcomeOpacity: phaseProgress(t, scene.resolveAt - 0.2, scene.resolveAt),
  };
}
