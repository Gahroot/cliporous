import type { ReactElement } from 'react';
import { diagramPose } from '../../diagrams/motion';
import { StageSpace, UI_FONT, useStage, useWideStage } from '../../stage';
import { EvidenceDocumentClay, MissingEvidenceSlotClay } from '../kits/evidence';
import { RelationshipEntityClay } from '../kits/relationships';
import type { ExpansionKitColors } from '../scene-types';
import {
  type InformationPose,
  informationModelPosition,
  informationModelProjection,
} from './information-poses';
import type { ExpansionReasoningInformationScene } from './information-types';

export function InformationModels({
  scene,
  pose,
}: {
  scene: ExpansionReasoningInformationScene;
  pose: InformationPose;
}): ReactElement {
  const S = useStage();
  const colors: ExpansionKitColors = {
    surface: S.card,
    text: S.text,
    accent: S.accent,
    muted: S.muted,
  };
  if (scene.storyId === '05')
    return (
      <group>
        {scene.entities.map((entity, i) => (
          <RelationshipEntityClay
            key={entity.id}
            entity={{ ...entity, role: 'source' }}
            colors={colors}
            state="retained"
            pose={{ ...pose, reveal: pose.entities[i].reveal }}
            position={informationModelPosition(scene, i)}
          />
        ))}
      </group>
    );
  return (
    <group>
      {scene.records.map((record, i) => {
        const common = {
          id: record.id,
          colors,
          pose: { ...pose, reveal: pose.records[i].reveal },
          placement: { position: informationModelPosition(scene, i), scale: 0.8 },
        };
        return record.state === 'known' ? (
          <EvidenceDocumentClay
            key={record.id}
            {...common}
            state="retained"
            label={record.topic}
            source={record.ownerId}
          />
        ) : (
          <MissingEvidenceSlotClay
            key={record.id}
            {...common}
            state="unknown"
            label={record.topic}
          />
        );
      })}
    </group>
  );
}

/** Semantic identity labels track the real clay anchors during the shared stage handoff. No second canvas. */
export function InformationModelOverlay({
  scene,
  pose,
}: {
  scene: ExpansionReasoningInformationScene;
  pose: InformationPose;
}): ReactElement | null {
  const S = useStage();
  const wide = useWideStage();
  if (scene.visualMode !== 'hybrid') return null;
  const width = wide?.model.width ?? 1080,
    height = wide?.model.height ?? 960;
  const entries =
    scene.storyId === '05'
      ? pose.entities.map((entry, index) => ({ ...entry, index }))
      : [{ ...pose.records[pose.detailIndex], index: pose.detailIndex }];
  return (
    <StageSpace>
      <svg
        aria-label="Model source identities"
        width={width}
        height={height}
        style={{
          position: 'absolute',
          left: wide?.model.x ?? 0,
          top: wide?.model.y ?? 0,
          pointerEvents: 'none',
          opacity: diagramPose(pose.time, scene, 'action').modelOpacity,
        }}
      >
        <title>Model source identities</title>
        {entries.map((entry) => {
          const p = informationModelProjection(scene, pose.time, entry.index, width, height);
          return (
            <g key={entry.id} opacity={entry.reveal} data-projected-id={entry.id}>
              <circle cx={p.x} cy={p.y} r={4} fill={S.accent} />
              <text
                x={p.x}
                y={p.y - 24}
                textAnchor="middle"
                fill={S.text}
                fontFamily={UI_FONT}
                fontSize={16}
              >
                {entry.id}
              </text>
            </g>
          );
        })}
      </svg>
    </StageSpace>
  );
}
