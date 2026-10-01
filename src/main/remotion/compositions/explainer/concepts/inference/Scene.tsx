import type React from 'react';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { useSceneTime, useStage } from '../../stage';
import { projectToStage } from '../../three-helpers';
import { CloudService, DataPaper, Device, ExpertTool, TaskFolder } from './models';
import {
  edgeCloudPose,
  expertSelectionPose,
  type InferencePoint,
  TOKEN_PREFIX,
  TOKEN_SOCKET,
  tokenChoicePose,
} from './poses';
import type {
  EdgeCloudScene,
  ExpertSelectionScene,
  InferenceScene,
  TokenChoiceScene,
} from './types';

/** Same camera as ExplanationStage, not a second canvas or clock-driven HTML overlay. */
function WorldLabel({
  position,
  children,
  width = 190,
  opacity = 1,
  size = 26,
}: {
  position: InferencePoint;
  children: React.ReactNode;
  width?: number;
  opacity?: number;
  size?: number;
}): React.ReactElement {
  const S = useStage();
  const p = projectToStage(EXPLANATION_CAMERA, position);
  return (
    <div
      style={{
        position: 'absolute',
        left: p.x - width / 2,
        top: p.y - 18,
        width,
        color: S.text,
        fontFamily: S.font,
        fontWeight: 650,
        fontSize: size,
        lineHeight: 1.16,
        textAlign: 'center',
        overflowWrap: 'anywhere',
        opacity,
        pointerEvents: 'none',
        textShadow: `0 1px 3px ${S.cardRaised}`,
      }}
    >
      {children}
    </div>
  );
}

function WordTile({
  position,
  reveal,
  selected = false,
  tentative = false,
}: {
  position: InferencePoint;
  reveal: number;
  selected?: boolean;
  tentative?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <group position={position} scale={[1, Math.max(0.001, reveal), 1]}>
      <ClayBlock size={[1.85, 0.8, 0.18]} color={S.cardRaised} />
      {/* An underline seats the chosen word; a divided underline retains tentative status. */}
      {selected &&
        (tentative ? [-0.55, 0, 0.55] : [0]).map((x) => (
          <ClayBlock
            key={x}
            size={[tentative ? 0.34 : 1.45, 0.055, 0.04]}
            position={[x, -0.31, 0.13]}
            color={S.accent}
            radius={0.015}
          />
        ))}
    </group>
  );
}

function TokenChoice({ scene }: { scene: TokenChoiceScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = tokenChoicePose(scene, t);
  return (
    <>
      <ExplanationStage
        scene={scene}
        labels={[scene.subject, scene.uncertainty ?? 'Next word options']}
      >
        <group position={TOKEN_PREFIX}>
          <ClayBlock size={[2.8, 0.85, 0.22]} color={S.cardRaised} />
          <ClayBlock size={[2.55, 0.055, 0.045]} position={[0, -0.34, 0.14]} color={S.text} />
        </group>
        <group position={TOKEN_SOCKET}>
          <ClayBlock size={[2.02, 0.11, 0.43]} position={[0, -0.48, 0]} color={S.accent} />
        </group>
        {pose.candidates.map((candidate) => (
          <WordTile
            key={candidate.id}
            position={candidate.position}
            reveal={candidate.reveal}
            selected={candidate.selected}
            tentative={pose.uncertain}
          />
        ))}
        {pose.next.map((candidate) => (
          <WordTile key={candidate.id} position={candidate.position} reveal={candidate.reveal} />
        ))}
      </ExplanationStage>
      <WorldLabel position={TOKEN_PREFIX} width={205}>
        {scene.sentence}
      </WorldLabel>
      {pose.candidates.map((candidate) => (
        <WorldLabel
          key={candidate.id}
          position={candidate.position}
          width={142}
          opacity={candidate.reveal}
        >
          {candidate.label}
        </WorldLabel>
      ))}
      {pose.next.map((candidate) => (
        <WorldLabel
          key={candidate.id}
          position={candidate.position}
          width={142}
          opacity={candidate.reveal}
        >
          {candidate.label}
        </WorldLabel>
      ))}
    </>
  );
}

function ExpertSelection({ scene }: { scene: ExpertSelectionScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = expertSelectionPose(scene, t);
  return (
    <>
      <ExplanationStage
        scene={scene}
        labels={scene.experts.map(
          (expert, i) =>
            `${expert.label} · ${pose.experts[i].active ? 'selected' : t < scene.actionAt ? 'waiting' : 'inactive'}`,
        )}
      >
        <group position={pose.task}>
          <TaskFolder />
        </group>
        {pose.experts.map((expert, i) => (
          <group key={expert.id}>
            <group position={expert.position}>
              <ClayBlock size={[1.8, 0.16, 1.2]} position={[0, -0.77, 0]} color={S.card} />
              <ClayBlock size={[0.95, 0.35, 0.65]} position={[0, -0.53, 0]} color={S.cardRaised} />
              <group position={[0, expert.lift - expert.stroke, 0]}>
                <ExpertTool role={scene.experts[i].role} />
              </group>
              {/* Inactive stations retain a closed bar; selection opens a physical receiving slot. */}
              <ClayBlock
                size={[1.3, 0.12, 0.13]}
                position={[0, -0.35 + expert.lift, 0.56]}
                color={expert.active ? S.accent : S.text}
              />
            </group>
            {expert.request.visible && (
              <group position={expert.request.position}>
                <DataPaper color={S.accent} />
              </group>
            )}
            {expert.contribution.visible && (
              <group
                position={expert.contribution.position}
                scale={Math.max(0.001, expert.contribution.reveal)}
              >
                <DataPaper color={S.accent} />
              </group>
            )}
          </group>
        ))}
      </ExplanationStage>
      <WorldLabel position={[0, -1.2, 1.8]} width={240}>
        {scene.subject}
      </WorldLabel>
      {pose.experts.map(
        (expert, i) =>
          expert.contribution.visible && (
            <WorldLabel
              key={expert.id}
              position={[expert.position[0], -0.7, 0.35]}
              width={175}
              size={24}
              opacity={expert.contribution.reveal}
            >
              {scene.experts[i].contribution}
            </WorldLabel>
          ),
      )}
    </>
  );
}

function EdgeCloud({ scene }: { scene: EdgeCloudScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = edgeCloudPose(scene, t);
  return (
    <>
      <ExplanationStage
        scene={scene}
        labels={
          scene.remote
            ? [scene.subject, scene.remote.service]
            : [scene.subject, 'This local operation']
        }
      >
        <group position={pose.device}>
          <Device kind={scene.device} press={pose.chipPress} />
        </group>
        {scene.remote && (
          <>
            <group position={pose.cloud}>
              <CloudService />
            </group>
            {/* Two physical lanes make request and return direction distinct without relying on color. */}
            <ClayBlock size={[2.25, 0.035, 0.06]} position={[0.1, -0.7, -0.5]} color={S.card} />
            <ClayBlock size={[2.25, 0.035, 0.06]} position={[0.1, -0.75, 0.8]} color={S.card} />
          </>
        )}
        {pose.localInput.visible && (
          <group position={pose.localInput.position}>
            <DataPaper color={S.text} scale={0.38} />
          </group>
        )}
        {pose.localResult.visible && (
          <group position={pose.localResult.position} scale={pose.localResult.reveal}>
            <DataPaper color={S.accent} scale={0.4} />
          </group>
        )}
        {pose.outbound.visible && (
          <group position={pose.outbound.position}>
            <DataPaper color={S.text} />
          </group>
        )}
        {pose.inbound.visible && (
          <group position={pose.inbound.position}>
            <DataPaper color={S.accent} />
          </group>
        )}
      </ExplanationStage>
      {/* Separate device/service columns keep capped labels off the silhouettes and return lane. */}
      <WorldLabel position={[pose.device[0], 2.3, 0]} width={300}>
        {scene.localWork}
      </WorldLabel>
      {pose.localResult.visible && (
        <WorldLabel
          position={[pose.device[0], -2.25, 0.7]}
          width={300}
          opacity={pose.localResult.reveal}
        >
          {scene.localResult}
        </WorldLabel>
      )}
      {scene.remote && pose.outbound.visible && (
        <WorldLabel position={[pose.cloud[0], 2.3, pose.cloud[2]]} width={300} size={24}>
          {scene.remote.work}
        </WorldLabel>
      )}
      {scene.remote && pose.inbound.visible && (
        <WorldLabel position={[pose.cloud[0], -2, pose.cloud[2]]} width={300} size={24}>
          {scene.remote.result}
        </WorldLabel>
      )}
    </>
  );
}

export function InferenceSceneView({ scene }: { scene: InferenceScene }): React.ReactElement {
  switch (scene.kind) {
    case 'token-choice':
      return <TokenChoice scene={scene} />;
    case 'expert-selection':
      return <ExpertSelection scene={scene} />;
    case 'edge-cloud':
      return <EdgeCloud scene={scene} />;
  }
}
