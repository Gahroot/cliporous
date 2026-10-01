import type React from 'react';
import { Clay } from './hero-kit';
import { GearsRig } from './hero-props/mechanics';
import { SignalWire } from './mechanisms/composed-rigs';
import { MechanismStage } from './mechanisms/MechanismStage';
import { mixHex } from './palette';
import { useSceneTime, useStage } from './stage';
import { agentWorkflowCamera } from './technology/agent-camera';
import {
  type AgentWorkflowPose,
  agentWorkflowPose,
  agentWorkflowTiming,
} from './technology/agent-workflow';
import { CheckSeal, ClayPart as Part, StopSeal } from './technology/clay';
import { phaseProgress } from './technology/motion';
import { Outcome, TechText } from './technology/primitives';
import type { AgentWorkflowScene as Scene } from './technology/types';
import { type CameraSpec, projectToStage } from './three-helpers';

type Point = [number, number, number];

const CALL_RAIL: Point[] = [
  [-2.25, -0.68, 0.075],
  [-0.65, -0.68, 0.075],
  [0.5, -0.68, -0.26],
  [2.24, -0.68, -0.26],
];
const CHECK_RAIL: Point[] = [
  [2.24, -0.68, -0.26],
  [2.24, -0.68, 1],
];
const RETURN_RAIL: Point[] = [
  [2.24, -0.68, 1],
  [-2.25, -0.68, 1],
  [-2.25, -0.68, 0.075],
];
const PHASE_COPY: Record<AgentWorkflowPose['phase'], string> = {
  setup: 'Task received',
  call: 'Calling tool',
  stopped: 'Tool stopped',
  retry: 'Retrying tool',
  result: 'Result returned',
  'approval-requested': 'Awaiting approval',
  checked: 'Checking result',
  resolved: 'Task complete',
};

function Controller(): React.ReactElement {
  const S = useStage();
  const housing = mixHex(S.paper, S.clay[1], 0.3);
  return (
    <group position={[-2.25, -0.08, -0.75]} rotation={[0, 0.08, 0]}>
      <Part size={[1.65, 1.18, 0.46]} position={[0, 0.32, 0]} color={housing} radius={0.2} />
      <Part
        size={[1.3, 0.86, 0.08]}
        position={[0, 0.33, 0.24]}
        color={mixHex(S.clay[2], S.bgOuter, 0.55)}
        radius={0.12}
      />
      {/* A routing motif, not a fake terminal or external product screenshot. */}
      <SignalWire
        points={[
          [-0.38, 0.38, 0.3],
          [0, 0.38, 0.3],
          [0.32, 0.6, 0.3],
        ]}
        radius={0.025}
        color={S.clay[0]}
      />
      <SignalWire
        points={[
          [0, 0.38, 0.3],
          [0.32, 0.18, 0.3],
        ]}
        radius={0.025}
        color={S.clay[0]}
      />
      {[
        [-0.42, 0.38, 0.32],
        [0.35, 0.61, 0.32],
        [0.35, 0.17, 0.32],
      ].map(([x, y, z]) => (
        <mesh key={`${x}:${y}`} position={[x, y, z]}>
          <sphereGeometry args={[0.075, 16, 12]} />
          <Clay color={S.accent} />
        </mesh>
      ))}
      <Part size={[0.22, 0.38, 0.22]} position={[0, -0.43, -0.04]} color={S.clay[1]} />
      <Part size={[1.7, 0.18, 0.8]} position={[0, -0.63, 0.16]} color={housing} radius={0.08} />
    </group>
  );
}

function ToolDock({ pose, angle }: { pose: AgentWorkflowPose; angle: number }): React.ReactElement {
  const S = useStage();
  const shell = mixHex(S.paper, S.clay[2], 0.28);
  return (
    <group position={[2.24 + pose.toolOffset / 125, 0, -0.55]}>
      <Part size={[1.8, 0.18, 1.42]} position={[0, -0.75, 0]} color={shell} />
      <Part size={[0.22, 1.45, 1.05]} position={[-0.77, -0.05, -0.14]} color={S.clay[1]} />
      <Part size={[0.22, 1.45, 1.05]} position={[0.77, -0.05, -0.14]} color={S.clay[1]} />
      <Part size={[1.78, 0.25, 1.12]} position={[0, 0.75, -0.17]} color={shell} radius={0.11} />
      <Part
        size={[1.34, 0.63, 0.16]}
        position={[0, 0.35, -0.68]}
        color={mixHex(S.clay[2], S.bgOuter, 0.22)}
      />
      <group position={[0.04, 0.42, -0.03]} scale={0.4}>
        <GearsRig a1={angle} />
      </group>
      {/* The slot remains open, so the same paper can enter and leave without passing through a wall. */}
      <Part
        size={[1.22, 0.045, 0.065]}
        position={[0, -0.55, 0.62]}
        color={S.accent}
        radius={0.02}
      />
      {pose.toolStatus === 'blocked' && <StopSeal position={[0.8, 0.78, 0.44]} />}
      {pose.toolStatus === 'passed' && <CheckSeal position={[0.8, 0.78, 0.44]} />}
    </group>
  );
}

function CheckDock({ pose }: { pose: AgentWorkflowPose }): React.ReactElement {
  const S = useStage();
  return (
    <group position={[2.24, 0, 1]}>
      <Part
        size={[1.92, 0.16, 1.2]}
        position={[0, -0.76, 0]}
        color={mixHex(S.paper, S.clay[0], 0.25)}
      />
      <Part size={[0.15, 0.59, 0.15]} position={[-0.87, -0.4, 0.48]} color={S.clay[1]} />
      <Part size={[0.15, 0.59, 0.15]} position={[0.87, -0.4, 0.48]} color={S.clay[1]} />
      <group position={[-0.86, -0.12, 0.48]} rotation={[0, 0, (pose.gateOpen * Math.PI) / 2]}>
        <Part size={[1.72, 0.11, 0.12]} position={[0.86, 0, 0]} color={S.accent} radius={0.05} />
        <Part size={[0.16, 0.14, 0.14]} position={[0.46, 0, 0]} color={S.paper} radius={0.035} />
        <Part size={[0.16, 0.14, 0.14]} position={[1.18, 0, 0]} color={S.paper} radius={0.035} />
      </group>
      {pose.verified && <CheckSeal position={[1.01, 0.07, 0.48]} scale={0.85} />}
    </group>
  );
}

function paperPosition(pose: AgentWorkflowPose): Point {
  return [(pose.task.x + 122 - 540) / 125, -0.42, (pose.task.y - 400) / 200];
}

function RequestPaper({ pose }: { pose: AgentWorkflowPose }): React.ReactElement {
  const S = useStage();
  return (
    <group position={paperPosition(pose)}>
      <Part size={[1.22, 0.065, 0.83]} color={mixHex(S.paper, '#ffffff', 0.2)} radius={0.06} />
      <Part
        size={[0.085, 0.023, 0.65]}
        position={[-0.48, 0.045, 0]}
        color={S.accent}
        radius={0.02}
      />
      <Part
        size={[0.64, 0.022, 0.042]}
        position={[0.03, 0.045, -0.19]}
        color={S.clay[1]}
        radius={0.014}
      />
      <Part
        size={[0.47, 0.022, 0.042]}
        position={[-0.055, 0.045, -0.04]}
        color={S.clay[1]}
        radius={0.014}
      />
      <Part
        size={[0.2, 0.055, 0.18]}
        position={[0.49, 0.06, -0.29]}
        rotation={[0, 0.3, 0]}
        color={S.clay[0]}
        radius={0.03}
      />
      {pose.resultVisible && (
        <Part
          size={[0.43, 0.045, 0.3]}
          position={[0.4, 0.065, 0.34]}
          color={pose.verified ? S.positive : S.clay[0]}
          radius={0.055}
        />
      )}
    </group>
  );
}

function DeskRig({ pose, angle }: { pose: AgentWorkflowPose; angle: number }): React.ReactElement {
  const S = useStage();
  return (
    <group>
      <Part size={[6.85, 0.31, 3.46]} position={[0, -1, 0.05]} color={S.clay[2]} radius={0.14} />
      <Part
        size={[6.35, 0.12, 3.03]}
        position={[0, -0.81, 0.05]}
        color={mixHex(S.clay[2], S.bgInner, 0.25)}
        radius={0.05}
      />
      {[
        [-2.85, -1.27, -1.1],
        [2.85, -1.27, -1.1],
        [-2.85, -1.27, 1.2],
        [2.85, -1.27, 1.2],
      ].map(([x, y, z]) => (
        <Part
          key={`${x}:${z}`}
          size={[0.42, 0.35, 0.42]}
          position={[x, y, z]}
          color={S.clay[2]}
          radius={0.14}
        />
      ))}
      <SignalWire points={CALL_RAIL} radius={0.035} color={S.clay[1]} />
      <SignalWire points={CHECK_RAIL} radius={0.035} color={S.clay[1]} />
      <SignalWire points={RETURN_RAIL} radius={0.035} color={S.clay[1]} />
      <Controller />
      <ToolDock pose={pose} angle={angle} />
      <CheckDock pose={pose} />
      <RequestPaper pose={pose} />
    </group>
  );
}

function DeskLabels({
  scene,
  pose,
  camera,
}: {
  scene: Scene;
  pose: AgentWorkflowPose;
  camera: CameraSpec;
}): React.ReactElement {
  const S = useStage();
  const agent = projectToStage(camera, [-2.25, 1.45, -0.75]);
  const tool = projectToStage(camera, [2.24, 1.4, -0.55]);
  const check = projectToStage(camera, [2.24, -1.155, 1.85]);
  const paper = projectToStage(camera, paperPosition(pose));
  return (
    <>
      {scene.condition && (
        <TechText x={72} y={145} width={936} size={30} align="center">
          {scene.condition}
        </TechText>
      )}
      <TechText x={agent.x - 125} y={agent.y - 36} width={250} size={38} align="center">
        Agent
      </TechText>
      <TechText x={tool.x - 135} y={tool.y - 35} width={270} size={34} align="center">
        {scene.toolLabel}
      </TechText>
      <TechText x={check.x - 135} y={check.y + 30} width={270} size={32} align="center">
        {scene.preset === 'approval-gate' ? 'Human approval' : 'Result check'}
      </TechText>
      <div
        style={{
          position: 'absolute',
          left: paper.x - 130,
          top: paper.y + 30,
          width: 260,
          textAlign: 'center',
          color: S.paperText,
          fontFamily: S.font,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.12,
          overflowWrap: 'anywhere',
        }}
      >
        {pose.subject}
      </div>
      <TechText x={72} y={205} width={936} size={30} align="center">
        {pose.conditional && pose.phase === 'resolved'
          ? 'Possible outcome'
          : PHASE_COPY[pose.phase]}
      </TechText>
      <Outcome
        text={pose.conditional ? `Possible: ${scene.outcome}` : scene.outcome}
        opacity={pose.outcomeOpacity}
        status={pose.completed ? 'passed' : 'waiting'}
      />
    </>
  );
}

/** One real clay stage. The source-checked request remains the same physical paper throughout. */
export function AgentWorkflowScene({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = agentWorkflowPose(scene, t);
  const timing = agentWorkflowTiming(scene);
  const firstTurn = phaseProgress(t, scene.actionAt, scene.responseAt);
  const retryTurn =
    scene.preset === 'tool-retry' ? phaseProgress(t, timing.retryContactAt, timing.resultAt) : 0;
  const angle = (firstTurn + retryTurn) * Math.PI * 0.9;
  const camera = agentWorkflowCamera(scene, t);
  return (
    <MechanismStage
      title={scene.label}
      camera={camera}
      bobAmount={0}
      overlay={(sampled) => <DeskLabels scene={scene} pose={pose} camera={sampled} />}
    >
      <DeskRig pose={pose} angle={angle} />
    </MechanismStage>
  );
}
