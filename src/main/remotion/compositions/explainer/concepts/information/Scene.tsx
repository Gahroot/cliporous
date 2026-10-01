import type React from 'react';
import { ClayBlock, ExplanationStage } from '../../explanation-kit';
import { useSceneTime, useStage } from '../../stage';
import { TechText } from '../../technology/primitives';
import {
  CandidateStand,
  DetailFragment,
  FunctionalLayer,
  MediaSource,
  ProvenanceLink,
  ResultBinder,
  SkillStation,
  SourceDocument,
  TopicCradle,
} from './models';
import {
  INFORMATION_YAW,
  type InformationPoint,
  informationProject,
  informationTransformPose,
  semanticSortLabels,
  semanticSortPose,
  systemLayersPose,
} from './poses';
import type {
  InformationScene,
  InformationTransformScene,
  SemanticSortScene,
  SystemLayersScene,
} from './types';

function SemanticSort({ scene }: { scene: SemanticSortScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = semanticSortPose(scene, t);
  const labels = semanticSortLabels(scene);
  const colors = [S.accent, S.accent2, S.text];
  return (
    <>
      <ExplanationStage scene={scene}>
        <group rotation={[0, INFORMATION_YAW, 0]}>
          {pose.targets.map((target, index) => (
            <group key={target.id} position={target.position}>
              {scene.preset === 'topic-clusters' ? (
                <TopicCradle index={index} color={colors[index]} reveal={pose.reveal} />
              ) : scene.preset === 'closest-match' ? (
                <CandidateStand
                  index={index}
                  color={colors[index]}
                  selected={target.selected ? pose.reveal : 0}
                />
              ) : (
                <SkillStation
                  index={index}
                  color={colors[index]}
                  paired={target.selected ? pose.reveal : 0}
                />
              )}
            </group>
          ))}
          {pose.items.map((item, index) => (
            <group
              key={item.id}
              position={item.position}
              rotation={[item.tilt, 0, 0]}
              scale={scene.preset === 'closest-match' ? 0.62 : 0.7}
            >
              <SourceDocument index={index} color={colors[index % colors.length]} />
            </group>
          ))}
          {pose.items
            .filter((item) => !item.paired)
            .map((item) => (
              <ClayBlock
                key={item.id}
                size={[1.16, 0.1, 0.65]}
                position={[item.position[0], -0.82, item.position[2]]}
                color={S.card}
              />
            ))}
        </group>
      </ExplanationStage>
      {labels.targets.map((anchor, index) => (
        <TechText
          key={anchor.id}
          x={anchor.x}
          y={anchor.y}
          width={anchor.width}
          size={26}
          align="center"
        >
          {scene.targets[index].label}
        </TechText>
      ))}
      {labels.items.map((anchor, index) => (
        <TechText
          key={anchor.id}
          x={anchor.x}
          y={anchor.y}
          width={anchor.width}
          size={22}
          align="center"
        >
          <span style={{ color: colors[index % colors.length], letterSpacing: 2 }}>
            {'•'.repeat(index + 1)}{' '}
          </span>
          {scene.items[index].label}
          {scene.items[index].targetId === null && (
            <div style={{ fontSize: 19, color: S.muted }}>Unpaired · front lane</div>
          )}
        </TechText>
      ))}
      <TechText x={100} y={828} width={880} size={25} align="center">
        {scene.preset === 'skill-match'
          ? 'Pairing is not completed work'
          : 'Similarity is not proof'}
      </TechText>
    </>
  );
}

function SystemLayers({ scene }: { scene: SystemLayersScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = systemLayersPose(scene, t);
  const colors = [S.accent, S.accent2, S.text, S.accent];
  return (
    <>
      <ExplanationStage scene={scene} labels={[scene.subject]}>
        <group rotation={[0, INFORMATION_YAW, 0]}>
          <ClayBlock
            size={[3.3, 0.18, 2.12]}
            position={[0, -1.3, 0]}
            color={S.card}
            radius={0.13}
          />
          {pose.layers.map((layer, index) => (
            <group key={layer.id} position={layer.position}>
              <FunctionalLayer
                index={index}
                role={scene.layers[index].role}
                device={scene.preset === 'device-stack'}
                color={colors[index]}
              />
            </group>
          ))}
          {pose.layers.slice(1).map((layer, index) => (
            <ProvenanceLink
              key={layer.id}
              from={[1.12, pose.layers[index].position[1] + 0.17, 0.55]}
              to={[1.12, layer.position[1], 0.55]}
              color={S.accent}
              reveal={pose.connections}
            />
          ))}
        </group>
      </ExplanationStage>
      <svg
        width={1080}
        height={960}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {pose.layers.map((layer, index) => {
          const p = informationProject([-1.5, layer.position[1] + 0.1, 0.4]);
          const y = 580 - index * 83;
          return (
            <path
              key={layer.id}
              d={`M290 ${y + 17} H310 L${p.x - 8} ${p.y}`}
              fill="none"
              stroke={S.muted}
              strokeWidth={1.6}
            />
          );
        })}
      </svg>
      {scene.layers.map((layer, index) => (
        <TechText key={layer.id} x={80} y={580 - index * 83} width={204} size={26} align="right">
          {layer.label}
        </TechText>
      ))}
      <TechText x={100} y={732} width={880} size={25} align="center">
        Same parts · visible connections
      </TechText>
    </>
  );
}

/** Shared by the physical thread and its text-clearance reservation. */
export function informationTransformWire(source: InformationPoint) {
  return {
    from: [-1.96, source[1] - 0.08, 0.1] as InformationPoint,
    to: [0.62, source[1] - 0.08, 0.1] as InformationPoint,
  };
}

/** Keep the complete text columns beyond every thread endpoint, not just above one row.
 * TechText uses 1.16 line-height; narrower columns get four field / five detail lines at 22px.
 */
export function informationTransformLabels(scene: InformationTransformScene) {
  const size = 22;
  const wires = informationTransformPose(scene, scene.setupAt).inputs.map((input) =>
    informationTransformWire(input.source),
  );
  const fieldX = Math.ceil(Math.max(...wires.map((wire) => informationProject(wire.to).x))) + 16;
  const detailX = fieldX + 178 + 28;
  return {
    heading: { x: 412, y: 232, width: 604, size: 29, height: 29 * 1.16 * 2 },
    inputs: scene.inputs.map((input, index) => {
      const y = 316 + (index + (3 - scene.inputs.length) / 2) * 132;
      return {
        id: input.id,
        source: { x: 64, y, width: 188, size, height: size * 1.16 * 4 },
        field: { x: fieldX, y, width: 178, size, height: size * 1.16 * 4 },
        detail: { x: detailX, y, width: 1016 - detailX, size, height: size * 1.16 * 5 },
      };
    }),
  };
}

function InformationTransform({ scene }: { scene: InformationTransformScene }): React.ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const pose = informationTransformPose(scene, t);
  const colors = [S.accent, S.accent2, S.text];
  const labels = informationTransformLabels(scene);
  return (
    <>
      <ExplanationStage scene={scene} labels={[scene.subject, scene.resultLabel]}>
        <group rotation={[0, INFORMATION_YAW, 0]}>
          <ResultBinder fusion={scene.preset === 'multimodal-fusion'} binding={pose.binding} />
          {pose.inputs.map((input, index) => (
            <group key={input.id}>
              <group position={input.source} scale={0.68}>
                <MediaSource
                  index={index}
                  medium={scene.inputs[index].medium}
                  color={colors[index]}
                />
              </group>
              <ProvenanceLink
                {...informationTransformWire(input.source)}
                color={colors[index]}
                reveal={input.progress}
              />
              <group
                position={input.position}
                scale={[input.detailScale, 0.65 + input.progress * 0.35, 1]}
              >
                <DetailFragment
                  index={index}
                  color={colors[index]}
                  medium={scene.inputs[index].medium}
                />
              </group>
            </group>
          ))}
        </group>
      </ExplanationStage>
      <TechText {...labels.heading} align="center">
        {scene.resultLabel}
      </TechText>
      <svg
        width={1080}
        height={960}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {pose.inputs.map((input, index) => {
          const source = informationProject(input.source);
          const box = labels.inputs[index].source;
          return (
            <path
              key={input.id}
              d={`M${box.x + box.width + 4} ${box.y + box.height / 2} L${source.x - 42} ${source.y}`}
              fill="none"
              stroke={colors[index]}
              strokeWidth={1.6}
            />
          );
        })}
      </svg>
      {pose.inputs.map((input, index) => {
        const row = labels.inputs[index];
        return (
          <div key={input.id}>
            <TechText {...row.source} align="right">
              {scene.inputs[index].label}
            </TechText>
            <TechText {...row.field} opacity={pose.binding}>
              {scene.inputs[index].field}
            </TechText>
            <TechText {...row.detail} opacity={Math.min(1, input.progress * 2)}>
              {scene.inputs[index].detail}
            </TechText>
          </div>
        );
      })}
      <TechText x={100} y={732} width={880} size={25} align="center">
        Source marks retained · no added facts
      </TechText>
    </>
  );
}

export function InformationSceneView({ scene }: { scene: InformationScene }): React.ReactElement {
  switch (scene.kind) {
    case 'semantic-sort':
      return <SemanticSort scene={scene} />;
    case 'system-layers':
      return <SystemLayers scene={scene} />;
    case 'information-transform':
      return <InformationTransform scene={scene} />;
  }
}
