import type React from 'react';
import { Clay } from './hero-kit';
import { SignalWire } from './mechanisms/composed-rigs';
import { MechanismStage } from './mechanisms/MechanismStage';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import { CheckSeal, ClayPart, StopSeal } from './technology/clay';
import { phaseProgress } from './technology/motion';
import { Outcome, TechText } from './technology/primitives';
import {
  SOFTWARE_RELEASE_CAMERA,
  softwareCheckLabelPosition,
  softwareDocumentPosition,
  softwareGatePosition,
  softwareReceiptPosition,
  softwareReceiptTrack,
  SOFTWARE_RELEASE_VIEW as V,
} from './technology/software-camera';
import { type SoftwareReleasePose, softwareReleasePose } from './technology/software-release';
import type { SoftwareReleaseScene as Scene } from './technology/types';
import { type CameraSpec, projectToStage } from './three-helpers';

type Point = [number, number, number];
const CHECK_COPY = {
  waiting: 'Not run',
  active: 'Running',
  possible: 'Possible result',
  passed: 'Passed',
  blocked: 'Failed',
};

/** A bound, folded document, not invented code or a miniature terminal. */
function ChangeDocument({
  position,
  prior = false,
  passed = false,
  blocked = false,
}: {
  position: Point;
  prior?: boolean;
  passed?: boolean;
  blocked?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group position={position}>
      <ClayPart size={[1.16, 0.065, 0.82]} color={S.clay[1]} radius={0.04} />
      <ClayPart
        size={[1.1, 0.045, 0.78]}
        position={[0.025, 0.05, 0]}
        color={mixHex(S.paper, S.clay[1], 0.12)}
        radius={0.035}
      />
      <ClayPart
        size={[0.075, 0.024, 0.65]}
        position={[-0.42, 0.085, 0]}
        color={prior ? S.clay[2] : S.accent}
        radius={0.012}
      />
      <ClayPart
        size={[0.2, 0.045, 0.2]}
        position={[0.45, 0.085, -0.29]}
        rotation={[0, 0.25, 0]}
        color={S.clay[1]}
        radius={0.025}
      />
      <group position={[0.25, 0.1, 0.06]} rotation={[-Math.PI / 2, 0, 0]} scale={0.65}>
        {passed && <CheckSeal position={[0, 0, 0]} />}
        {blocked && <StopSeal position={[0, 0, 0]} />}
      </group>
    </group>
  );
}

function TestGate({
  check,
  parallel,
  index,
  conditional,
}: {
  check: SoftwareReleasePose['checks'][number];
  parallel: boolean;
  index: number;
  conditional: boolean;
}): React.ReactElement {
  const S = useStage();
  const gate = softwareGatePosition(parallel, index);
  const track = softwareReceiptTrack(parallel, index);
  const shell = mixHex(S.clay[1], S.clay[2], 0.3);
  return (
    <group>
      {/* Both checks inspect the same dock. Only their receipts branch, never the change. */}
      <SignalWire
        points={[
          [V.dockX, -0.65, 0.03],
          [V.dockX, -0.65, -0.35],
          [gate[0], -0.65, -0.35],
          [gate[0], -0.65, -1.05],
        ]}
        radius={0.028}
        color={S.clay[1]}
      />
      <group position={gate}>
        <ClayPart size={[1.5, 0.12, 0.95]} position={[0, -0.68, 0]} color={shell} />
        {[-0.64, 0.64].map((x) => (
          <ClayPart key={x} size={[0.18, 0.74, 0.5]} position={[x, -0.25, 0]} color={shell} />
        ))}
        <ClayPart size={[1.5, 0.2, 0.67]} position={[0, 0.2, 0]} color={shell} />
        <ClayPart
          size={[1.1, 0.35, 0.12]}
          position={[0, -0.16, -0.35]}
          color={mixHex(S.clay[2], S.bgOuter, 0.35)}
        />
        <ClayPart
          size={[1.08, 0.1, 0.12]}
          position={[0, -0.36 + check.open * 0.44, 0.32]}
          color={conditional ? S.clay[0] : check.status === 'blocked' ? S.negative : S.accent}
          radius={0.04}
        />
        {check.status === 'passed' && <CheckSeal position={[0.6, 0.23, 0.38]} scale={0.65} />}
        {check.status === 'blocked' && (
          <group scale={0.65} position={[0.6, 0.23, 0.38]}>
            <StopSeal position={[0, 0, 0]} />
          </group>
        )}
      </group>
      <SignalWire points={track} radius={0.025} color={S.clay[1]} />
      <mesh position={track[1]}>
        <cylinderGeometry args={[0.24, 0.27, 0.07, 24]} />
        <Clay color={S.clay[2]} />
      </mesh>
      <SignalWire
        points={[track[1], [V.joinX, -0.58, track[1][2]]]}
        radius={0.055}
        color={S.clay[1]}
      />
      {check.receiptVisible && (
        <group
          position={softwareReceiptPosition(check, parallel, index)}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {conditional ? (
            // Same receipt footprint and path, without a factual checkmark or pass material.
            <mesh rotation={[Math.PI / 2, 0, 0]} scale={0.7}>
              <cylinderGeometry args={[0.3, 0.3, 0.09, 32]} />
              <Clay color={S.clay[0]} />
            </mesh>
          ) : (
            <CheckSeal position={[0, 0, 0]} scale={0.7} />
          )}
        </group>
      )}
    </group>
  );
}

function Workbench({
  scene,
  pose,
}: {
  scene: Scene;
  pose: SoftwareReleasePose;
}): React.ReactElement {
  const S = useStage();
  const rollback = scene.preset === 'regression-rollback';
  const parallel = scene.preset === 'parallel-release';
  const surface = mixHex(S.clay[2], S.bgInner, 0.16);
  return (
    <group>
      <ClayPart size={[7.4, 0.28, 3.5]} position={[0, -1.02, 0]} color={S.clay[2]} radius={0.14} />
      <ClayPart size={[7, 0.1, 3.15]} position={[0, -0.83, 0]} color={surface} />
      {[-3.14, 3.14].flatMap((x) =>
        [-1.35, 1.35].map((z) => (
          <ClayPart
            key={`${x}:${z}`}
            size={[0.36, 0.3, 0.36]}
            position={[x, -1.25, z]}
            color={S.clay[2]}
          />
        )),
      )}
      {/* A real roller bed makes the held workpiece and its eventual delivery legible. */}
      <ClayPart
        size={[6.85, 0.1, 1.16]}
        position={[0, -0.71, V.laneZ]}
        color={mixHex(S.clay[2], S.bgOuter, 0.28)}
      />
      {Array.from({ length: 18 }, (_, i) => -3.23 + i * 0.38).map((x) => (
        <mesh key={x} position={[x, -0.64, V.laneZ]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 1.02, 16]} />
          <Clay color={S.clay[1]} />
        </mesh>
      ))}
      {[-0.1, 1.1].map((z) => (
        <ClayPart key={z} size={[6.85, 0.08, 0.075]} position={[0, -0.61, z]} color={S.clay[2]} />
      ))}
      {pose.checks.map((check, index) => (
        <TestGate
          key={check.position.x}
          check={check}
          parallel={parallel}
          index={index}
          conditional={Boolean(scene.condition)}
        />
      ))}
      {/* Two seated receipts unlock one common stop; one pass cannot lift this bar. */}
      {[-0.25, 1.25].map((z) => (
        <ClayPart
          key={z}
          size={[0.16, 1.16, 0.16]}
          position={[V.joinX, -0.1, z]}
          color={S.clay[1]}
        />
      ))}
      <ClayPart
        size={[0.15, 0.15, 1.5]}
        position={[V.joinX, -0.42 + pose.joinOpen * 0.82 + pose.joinRecoil / 180, V.laneZ]}
        color={scene.condition ? S.clay[0] : pose.blocked ? S.negative : S.accent}
        radius={0.05}
      />
      {pose.blocked && <StopSeal position={[V.joinX, 0.59, 1.25]} />}
      {/* The right receiving tray has an open back for the stated prior version's return. */}
      <ClayPart
        size={[1.5, 0.12, rollback ? 2.75 : 1.28]}
        position={[V.releaseX, -0.65, rollback ? -0.2 : V.laneZ]}
        color={S.clay[2]}
      />
      {(rollback ? [1.96, 3.34] : [3.34]).map((x) => (
        <ClayPart
          key={x}
          size={[0.12, 0.2, rollback ? 2.65 : 1.15]}
          position={[x, -0.5, rollback ? -0.2 : V.laneZ]}
          color={S.clay[1]}
        />
      ))}
      <ChangeDocument
        position={softwareDocumentPosition(pose.change, pose.dockRecoil)}
        passed={pose.released}
        blocked={pose.blocked}
      />
      {rollback && scene.previousVersion && (
        <ChangeDocument
          position={softwareDocumentPosition(pose.previousVersion)}
          prior
          passed={pose.restored}
        />
      )}
    </group>
  );
}

function WorkbenchLabels({
  scene,
  pose,
  camera,
  checksOpacity,
}: {
  scene: Scene;
  pose: SoftwareReleasePose;
  camera: CameraSpec;
  checksOpacity: number;
}): React.ReactElement {
  const S = useStage();
  const parallel = scene.preset === 'parallel-release';
  const rollback = scene.preset === 'regression-rollback';
  const change = projectToStage(camera, V.changeLabel);
  const release = projectToStage(camera, V.releaseLabel);
  const paper = projectToStage(camera, softwareDocumentPosition(pose.change));
  const prior = projectToStage(camera, softwareDocumentPosition(pose.previousVersion));
  const releaseCopy = scene.condition
    ? pose.outcomeOpacity > 0
      ? 'Possible outcome'
      : pose.checks.every((check) => check.receiptArrived)
        ? 'Possible join'
        : 'Possible path'
    : pose.restored
      ? 'Restored'
      : pose.blocked
        ? 'Blocked'
        : pose.released
          ? 'Released'
          : pose.joinReady
            ? parallel
              ? 'Both passed'
              : 'Check cleared'
            : parallel
              ? 'Wait for both'
              : 'Held';
  return (
    <>
      {scene.condition && (
        <TechText x={72} y={212} width={936} size={28} align="center">
          {scene.condition}
        </TechText>
      )}
      <TechText x={change.x - 90} y={change.y} width={180} size={32} align="center">
        Change
      </TechText>
      {pose.checks.map((check, index) => {
        const p = projectToStage(camera, softwareCheckLabelPosition(parallel, index));
        return (
          <TechText
            key={check.position.x}
            x={p.x - V.checkLabelWidth / 2}
            y={p.y}
            width={V.checkLabelWidth}
            size={26}
            align="center"
            opacity={checksOpacity}
          >
            {scene.checkLabels[index]}
            <div style={{ color: S.muted, fontSize: 24, marginTop: 7 }}>
              {scene.condition && check.status === 'active'
                ? 'Possible run'
                : scene.condition && check.status === 'waiting'
                  ? 'Pending'
                  : CHECK_COPY[check.status]}
            </div>
          </TechText>
        );
      })}
      <TechText x={release.x - 79} y={release.y} width={158} size={30} align="center">
        {pose.restored ? 'Live' : 'Release'}
        <div style={{ color: S.muted, fontSize: 25, marginTop: 8 }}>{releaseCopy}</div>
      </TechText>
      {/* A reserved identity rail below the clay keeps source text off pale geometry. */}
      <TechText
        x={paper.x - V.documentLabelWidth / 2}
        y={V.documentLabelY}
        width={V.documentLabelWidth}
        size={26}
        align="center"
      >
        {scene.subject}
      </TechText>
      {rollback && scene.previousVersion && (
        <TechText
          x={prior.x - V.documentLabelWidth / 2}
          y={V.documentLabelY}
          width={V.documentLabelWidth}
          size={26}
          align="center"
        >
          {scene.previousVersion}
        </TechText>
      )}
      <Outcome
        text={scene.condition ? `Possible: ${scene.outcome}` : scene.outcome}
        opacity={pose.outcomeOpacity}
        status={pose.released || pose.restored ? 'passed' : 'waiting'}
      />
    </>
  );
}

/** One fixed clay stage, with all movement and outcomes owned by the validated pose. */
export function SoftwareReleaseScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = softwareReleasePose(scene, t);
  return (
    <MechanismStage
      title={scene.condition ? `Possible: ${scene.label}` : scene.label}
      camera={SOFTWARE_RELEASE_CAMERA}
      bobAmount={0}
      overlay={(camera) => (
        <WorkbenchLabels
          scene={scene}
          pose={pose}
          camera={camera}
          checksOpacity={phaseProgress(t, scene.setupAt, scene.actionAt)}
        />
      )}
    >
      <Workbench scene={scene} pose={pose} />
    </MechanismStage>
  );
}
