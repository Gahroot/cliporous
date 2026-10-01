import type React from 'react';
import { useMemo } from 'react';
import { Clay, roundedRectShape } from './hero-kit';
import { MechanismStage } from './mechanisms/MechanismStage';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import { ClayPart } from './technology/clay';
import {
  CONTEXT_CLAY_LABELS,
  contextWindowCamera,
  contextWindowPoint,
} from './technology/context-camera';
import {
  type ContextWindowPose,
  contextWindowPose,
  CONTEXT_WINDOW_GEOMETRY as G,
} from './technology/context-window';
import { Outcome, TechText } from './technology/primitives';
import type { ContextWindowScene as Scene } from './technology/types';
import { type CameraSpec, projectToStage } from './three-helpers';

type Point = [number, number, number];
const WORK = contextWindowPoint(G.working);
const QUESTION = contextWindowPoint(G.question);
const STORED = contextWindowPoint(G.stored);
const OUTSIDE = contextWindowPoint(G.outside);
const TRAY_X = (WORK[0] + QUESTION[0]) / 2;

/** The identity stripe and raised lines stay on the same physical working copy. */
function Paper({
  position,
  opacity = 1,
  compact = false,
  neutral = false,
}: {
  position: Point;
  opacity?: number;
  compact?: boolean;
  neutral?: boolean;
}): React.ReactElement | null {
  const S = useStage();
  const width = compact ? 1.3 : 1.72;
  const depth = compact ? 0.7 : 0.92;
  const shape = useMemo(() => roundedRectShape(width, depth, 0.09), [width, depth]);
  if (opacity <= 0) return null;
  // Opaque geometry follows the same reveal amount. Fractional clay alpha caused
  // one-level RGB jitter on Windows ANGLE; shrinking the paper avoids that blend path.
  return (
    <group position={position} scale={opacity}>
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: 0.1,
              bevelEnabled: true,
              bevelSize: 0.015,
              bevelThickness: 0.015,
              bevelSegments: 2,
              steps: 1,
            },
          ]}
        />
        <Clay color={mixHex(S.paper, S.clay[1], 0.22)} />
      </mesh>
      <mesh position={[-width / 2 + 0.15, 0.075, 0]}>
        <boxGeometry args={[0.075, 0.025, depth - 0.2]} />
        <Clay color={neutral ? S.clay[2] : S.accent} />
      </mesh>
      {(compact ? [-0.13, 0.08] : [-0.26, -0.09, 0.08, 0.25]).map((z, index) => (
        <mesh key={z} position={[-0.03 - index * 0.045, 0.073, z]}>
          <boxGeometry args={[width - 0.58 - index * 0.09, 0.02, 0.036]} />
          <Clay color={S.clay[2]} />
        </mesh>
      ))}
      <mesh position={[width / 2 - 0.16, 0.095, -depth / 2 + 0.13]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.2, 0.06, 0.16]} />
        <Clay color={neutral ? S.clay[1] : S.clay[0]} />
      </mesh>
    </group>
  );
}

function WorkingTray({ offset }: { offset: number }): React.ReactElement {
  const S = useStage();
  const rim = mixHex(S.clay[2], S.clay[1], 0.18);
  return (
    <group position={[TRAY_X, offset, 0.05]}>
      <ClayPart size={[4.4, 0.32, 2.16]} position={[0, -0.75, 0]} color={S.clay[2]} radius={0.15} />
      <ClayPart
        size={[4.08, 0.07, 1.94]}
        position={[0, -0.56, 0]}
        color={mixHex(S.clay[2], S.bgInner, 0.22)}
      />
      {/* Two bounded bays, not a numeric capacity claim. The right bay has open slide mouths. */}
      {[-2.11, 0, 2.11].map((x) => (
        <ClayPart key={x} size={[0.16, 0.25, 2.04]} position={[x, -0.39, 0]} color={rim} />
      ))}
      {[-0.96, 0.96].map((z) => (
        <group key={z}>
          <ClayPart size={[2.08, 0.25, 0.16]} position={[-1.05, -0.39, z]} color={rim} />
          <ClayPart
            size={[1.92, 0.05, 0.15]}
            position={[1.05, -0.56, z]}
            color={S.clay[1]}
            radius={0.025}
          />
        </group>
      ))}
      {[-1.84, 1.84].flatMap((x) =>
        [-0.75, 0.75].map((z) => (
          <ClayPart
            key={`${x}:${z}`}
            size={[0.35, 0.34, 0.35]}
            position={[x, -1.06, z]}
            color={S.clay[2]}
          />
        )),
      )}
    </group>
  );
}

function Archive({ selected }: { selected: number }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[STORED[0], 0, STORED[2]]}>
      <ClayPart
        size={[1.94, 0.24, 1.64]}
        position={[0, -1.12, 0]}
        color={S.clay[2]}
        radius={0.12}
      />
      <ClayPart size={[1.88, 1.32, 0.16]} position={[0, -0.37, -0.73]} color={S.clay[2]} />
      {[-0.88, 0.88].map((x) => (
        <ClayPart key={x} size={[0.12, 1.2, 1.5]} position={[x, -0.425, 0]} color={S.clay[2]} />
      ))}
      {[-0.61, 0.12].map((y) => (
        <ClayPart key={y} size={[1.8, 0.11, 1.48]} position={[0, y, 0]} color={S.clay[1]} />
      ))}
      <ClayPart size={[1.6, 0.3, 0.12]} position={[0, -0.85, 0.75]} color={S.clay[2]} />
      <ClayPart
        size={[0.5, 0.065, 0.1]}
        position={[0, -0.85, 0.86]}
        color={S.clay[1]}
        radius={0.025}
      />
      <Paper position={[-0.025, -0.48, 0.06]} neutral />
      <Paper position={[0.025, -0.34, -0.03]} neutral />
      {/* The selected original NEVER leaves storage, even while its copy enters the tray. */}
      <Paper position={[0, STORED[1], 0]} />
      {[-1, 1].map((side) => (
        <ClayPart
          key={side}
          size={[0.1, 0.1, 0.42]}
          position={[side * (0.98 - selected * 0.075), 0.22, 0.18]}
          color={mixHex(S.clay[2], S.accent, selected)}
          radius={0.04}
        />
      ))}
    </group>
  );
}

function ContextRig({
  scene,
  pose,
}: {
  scene: Scene;
  pose: ContextWindowPose;
}): React.ReactElement {
  const S = useStage();
  const retrieval = scene.preset === 'memory-retrieval';
  const summary = scene.preset === 'summarisation';
  const recoil = -pose.trayOffset / 180;
  const seated = (point: Point): Point => [point[0], point[1] + recoil, point[2]];
  return (
    <group>
      <WorkingTray offset={recoil} />
      <Archive selected={pose.selected} />
      <Paper position={seated(QUESTION)} neutral={!retrieval} />
      {!retrieval && (
        <>
          {/* A separate landing shelf, visibly beyond the finite window; never a bin or shredder. */}
          <ClayPart
            size={[1.98, 0.22, 1.18]}
            position={[OUTSIDE[0], -0.635, OUTSIDE[2]]}
            color={S.clay[2]}
            radius={0.1}
          />
          <Paper position={contextWindowPoint(pose.detail)} opacity={pose.detail.opacity} />
          {summary ? (
            <Paper
              position={seated(contextWindowPoint(pose.summary))}
              opacity={pose.summary.opacity}
              compact
            />
          ) : (
            <Paper
              position={seated(contextWindowPoint(pose.subject))}
              opacity={pose.subject.opacity}
            />
          )}
        </>
      )}
      {retrieval && (
        <Paper
          position={seated(contextWindowPoint(pose.retrieved, 0.11 * pose.retrieved.opacity))}
          opacity={pose.retrieved.opacity}
        />
      )}
    </group>
  );
}

function ZoneLabel({
  camera,
  anchor,
  title,
  detail,
  width = 290,
  opacity = 1,
}: {
  camera: CameraSpec;
  anchor: Point;
  title: string;
  detail: string;
  width?: number;
  opacity?: number;
}): React.ReactElement {
  const S = useStage();
  const point = projectToStage(camera, anchor);
  return (
    <div
      style={{
        position: 'absolute',
        left: point.x - width / 2,
        top: Math.max(286, point.y),
        width,
        opacity,
        textAlign: 'center',
        fontFamily: S.font,
        color: S.text,
        overflowWrap: 'anywhere',
      }}
    >
      <div style={{ fontSize: 32, lineHeight: 1.12, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 24, lineHeight: 1.16, fontWeight: 550, marginTop: 6 }}>{detail}</div>
    </div>
  );
}

function ContextLabels({
  scene,
  pose,
  time,
  camera,
}: {
  scene: Scene;
  pose: ContextWindowPose;
  time: number;
  camera: CameraSpec;
}): React.ReactElement {
  const retrieval = scene.preset === 'memory-retrieval';
  const summary = scene.preset === 'summarisation';
  const arrived = time >= scene.checkAt;
  const active = arrived
    ? retrieval
      ? scene.detailLabel
      : summary
        ? (scene.summaryLabel ?? '')
        : scene.subject
    : retrieval
      ? scene.subject
      : scene.detailLabel;
  const phase = retrieval
    ? time < scene.actionAt
      ? `Question · ${scene.subject}`
      : time < scene.responseAt
        ? `Selecting · ${scene.detailLabel}`
        : arrived
          ? 'Selected copy · archive retained'
          : `Retrieving · ${scene.detailLabel}`
    : summary
      ? time < scene.actionAt
        ? scene.subject
        : time < scene.responseAt
          ? 'Detail leaves the working window'
          : arrived
            ? 'Key points kept · some detail omitted'
            : `Replacing · ${scene.summaryLabel ?? ''}`
      : time < scene.responseAt
        ? `Incoming · ${scene.subject}`
        : arrived
          ? 'Outside the window is not stored deletion'
          : `Leaving · ${scene.detailLabel}`;
  return (
    <>
      {scene.condition && (
        <TechText slot="condition" x={72} y={216} width={936} size={24} align="center">
          {scene.condition}
        </TechText>
      )}
      <ZoneLabel
        camera={camera}
        anchor={CONTEXT_CLAY_LABELS.tray}
        title="Working window"
        detail={active}
      />
      <ZoneLabel
        camera={camera}
        anchor={CONTEXT_CLAY_LABELS.archive}
        title="Archive"
        detail={scene.memoryLabel}
        width={280}
      />
      {!retrieval && (
        <ZoneLabel
          camera={camera}
          anchor={CONTEXT_CLAY_LABELS.outside}
          title={summary ? 'Detail omitted' : 'Outside window'}
          detail={scene.detailLabel}
          width={250}
          opacity={pose.outsideOpacity}
        />
      )}
      <TechText slot="status" x={72} y={762} width={936} size={28} align="center">
        {phase}
      </TechText>
      <Outcome
        text={scene.condition ? `Possible: ${scene.outcome}` : scene.outcome}
        opacity={pose.outcomeOpacity}
        status="active"
      />
    </>
  );
}

/** One clay canvas: a finite working tray, a separate persistent archive, and an outside shelf. */
export function ContextWindowScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const time = Number.isFinite(t) ? Math.min(t, scene.resolveAt) : 0;
  const pose = contextWindowPose(scene, time);
  return (
    <MechanismStage
      title={scene.label}
      camera={contextWindowCamera(scene, time)}
      bobAmount={0}
      overlay={(camera) => <ContextLabels scene={scene} pose={pose} time={time} camera={camera} />}
    >
      <ContextRig scene={scene} pose={pose} />
    </MechanismStage>
  );
}
