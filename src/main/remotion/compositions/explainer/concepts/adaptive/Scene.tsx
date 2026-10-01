import type React from 'react';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { Clay } from '../../hero-kit';
import { shade, useSceneTime, useStage } from '../../stage';
import { TechText } from '../../technology/primitives';
import {
  LocalLink,
  MachineRig,
  ObservationBracket,
  PerceptionObject,
  Person,
  Robot,
  ToolModule,
} from './models';
import {
  type AdaptivePoint,
  adaptiveLabelAnchor,
  collectivePatternPose,
  modularMachinePose,
  robotPerceptionPose,
} from './poses';
import type {
  AdaptiveScene,
  CollectivePatternScene,
  ModularMachineScene,
  RobotPerceptionScene,
} from './types';

function ActorLabel({
  position,
  label,
}: {
  position: AdaptivePoint;
  label: string;
}): React.ReactElement {
  const point = adaptiveLabelAnchor(position);
  return (
    <TechText {...point} width={144} size={23} align="center">
      {label}
    </TechText>
  );
}
function Floor(): React.ReactElement {
  const S = useStage();
  return <ClayBlock size={[6.2, 0.1, 3.4]} position={[0, -1.34, 0]} color={S.card} radius={0.05} />;
}

function CollectiveView({ scene }: { scene: CollectivePatternScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = collectivePatternPose(scene, t);
  const current = scene.relationships.filter((edge) => edge.at <= t).at(-1);
  const from = scene.actors.find((actor) => actor.id === current?.fromId);
  const to = scene.actors.find((actor) => actor.id === current?.toId);
  const relationshipLabel =
    from && to
      ? `${from.label} ${scene.preset === 'network-clusters' ? '↔' : '→'} ${to.label}`
      : scene.subject;
  return (
    <>
      <ExplanationStage scene={scene} labels={[relationshipLabel]}>
        <Floor />
        {pose.links.map((link) => (
          <group key={`${link.fromId}:${link.toId}`}>
            {link.progress > 0 && <LocalLink from={link.start} to={link.end} color={S.accent} />}
            {/* The local sender-to-neighbor contact is visible, not an ambient swarm. */}
            {scene.preset !== 'network-clusters' && link.progress > 0 && link.progress < 1 && (
              <group position={link.signal}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.12, 0.026, 8, 20]} />
                  <Clay color={S.accent} />
                </mesh>
              </group>
            )}
          </group>
        ))}
        {pose.actors.map((actor, index) => (
          <group key={actor.id} position={actor.position} rotation={[0, actor.yaw, 0]}>
            {scene.preset === 'coordinated-swarm' ? (
              <Robot wheelTurn={actor.linked * 2.4} color={S.clay[index % 3]} />
            ) : (
              <Person
                variant={index % 2 === 0}
                adopted={actor.adopted}
                showFlag={scene.preset === 'adoption-wave'}
              />
            )}
          </group>
        ))}
      </ExplanationStage>
      {pose.actors.map((actor, index) => (
        <ActorLabel key={actor.id} position={actor.position} label={scene.actors[index].label} />
      ))}
    </>
  );
}

function PerceptionView({ scene }: { scene: RobotPerceptionScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = robotPerceptionPose(scene, t);
  return (
    <>
      <ExplanationStage
        scene={scene}
        labels={[scene.target.label, scene.boundaryLabel, scene.distractor.label]}
      >
        <Floor />
        <group position={pose.robot}>
          <Robot headYaw={pose.headYaw} wheelTurn={pose.wheelTurn} />
          {pose.deferred > 0 && (
            <group position={[0, 1.26, 0]} scale={pose.deferred}>
              {[-1, 1].map((side) => (
                <ClayBlock
                  key={side}
                  size={[0.07, 0.23, 0.065]}
                  position={[side * 0.08, 0, 0]}
                  color={S.text}
                  radius={0.025}
                />
              ))}
            </group>
          )}
        </group>
        <group position={pose.target}>
          <PerceptionObject form={scene.target.form} />
          <ObservationBracket amount={pose.targetBracket} selected={pose.recognized} />
        </group>
        <group position={pose.distractor}>
          <PerceptionObject form={scene.distractor.form} />
          <ObservationBracket amount={pose.distractorBracket} selected={0} />
        </group>
        <ClayBlock
          size={[0.085, 0.045, 2.95]}
          position={[pose.boundaryX, -1.245, 0]}
          color={S.text}
          radius={0.015}
        />
        {[-1.42, 1.42].map((z) => (
          <group key={z} position={[pose.boundaryX, -1.25, z]}>
            <ClayBlock size={[0.22, 0.065, 0.22]} position={[0, 0.03, 0]} color={S.text} />
            <ClayBlock size={[0.075, 0.53, 0.075]} position={[0, 0.28, 0]} color={S.clay[2]} />
            <mesh position={[0, 0.58, 0]}>
              <sphereGeometry args={[0.075, 16, 10]} />
              <Clay color={S.cardRaised} />
            </mesh>
          </group>
        ))}
        {pose.observe > 0 &&
          t < scene.checkAt &&
          [pose.target, pose.distractor].map((position, index) => (
            <LocalLink
              key={index === 0 ? 'target-sight' : 'alternate-sight'}
              from={[pose.robot[0] + 0.45, -1.2, pose.robot[2]]}
              to={[position[0], -1.2, position[2]]}
              color={shade(S.accent, -0.15)}
            />
          ))}
      </ExplanationStage>
      <ActorLabel position={pose.robot} label={scene.subject} />
    </>
  );
}

function MachineView({ scene }: { scene: ModularMachineScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = modularMachinePose(scene, t);
  return (
    <ExplanationStage
      scene={scene}
      labels={[scene.current.label, scene.jobLabel, scene.candidate.label]}
    >
      <Floor />
      <MachineRig socketOpen={pose.socketOpen} />
      <group position={pose.current}>
        <ToolModule role={scene.current.role} color={S.clay[1]} />
      </group>
      <group position={pose.candidate}>
        <ToolModule
          role={scene.candidate.role}
          incompatible={scene.preset === 'incompatible-module'}
          turn={pose.toolTurn}
          stroke={pose.work}
          color={S.accent}
        />
        {pose.rejected && (
          <group position={[0, 0.67, 0]} rotation={[0, 0, Math.PI / 4]}>
            <ClayBlock size={[0.33, 0.055, 0.045]} color={S.text} radius={0.015} />
            <ClayBlock size={[0.055, 0.33, 0.045]} color={S.text} radius={0.015} />
          </group>
        )}
      </group>
      {/* A bounded machine work bed and clamped stock; the incompatible tool never touches it. */}
      <ClayBlock
        size={[0.8, 0.13, 0.45]}
        position={[0, -0.83, 0.22]}
        color={S.clay[1]}
        radius={0.025}
      />
      {[-1, 1].map((side) => (
        <ClayBlock
          key={side}
          size={[0.11, 0.16, 0.48]}
          position={[side * 0.44, -0.8, 0.22]}
          color={S.text}
          radius={0.02}
        />
      ))}
    </ExplanationStage>
  );
}

export function AdaptiveSceneView({ scene }: { scene: AdaptiveScene }): React.ReactElement {
  switch (scene.kind) {
    case 'collective-pattern':
      return <CollectiveView scene={scene} />;
    case 'robot-perception':
      return <PerceptionView scene={scene} />;
    case 'modular-machine':
      return <MachineView scene={scene} />;
  }
}
