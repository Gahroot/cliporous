import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import { authoredGeometryCamera } from '../kits/geometry';
import type { ExpansionKitColors } from '../scene-types';
import { connectionState, currentFact, type VisibilityAccessPose } from './visibility-access-poses';
import type { ExpansionVisibilityAccessScene } from './visibility-access-types';

/** Authored camera metadata, not a caller camera or an occlusion solver. */
export function VisibilityAccessModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionVisibilityAccessScene;
  pose: VisibilityAccessPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const fact = currentFact(scene, pose);
  const block = (
    name: string,
    at: [number, number, number],
    size: [number, number, number],
    color: string,
    opacity = 1,
  ) => (
    <mesh key={name} name={name} position={at}>
      <boxGeometry args={size} />
      <Clay color={color} opacity={opacity} />
    </mesh>
  );
  if (scene.storyId === '61' && 'targetId' in fact) {
    const existence = scene.records.find(
      (r) => r.role === 'existence' && r.actorId === fact.actorId && r.targetId === fact.targetId,
    );
    const solid = existence?.state === 'known' && existence.value === 'present';
    return (
      <group
        name="robot-target-occluder-schematic"
        userData={{
          camera: authoredGeometryCamera(scene.viewpoint),
          observerId: fact.actorId,
          targetId: fact.targetId,
          occluderId: 'occluderId' in fact ? fact.occluderId : undefined,
          schematic: true,
        }}
      >
        <group name="wheeled-camera-robot" position={[-1.5, -0.65, 0]}>
          {block('robot-chassis', [0, 0.25, 0], [0.8, 0.3, 0.6], colors.surface)}
          {block('robot-neck', [0, 0.53, 0], [0.12, 0.26, 0.12], colors.muted)}
          {block('robot-camera-head', [0, 0.8, 0], [0.65, 0.35, 0.35], colors.surface)}
          {[-1, 1].map((side) => (
            <mesh
              key={`eye-${side}`}
              name="camera-eye"
              position={[side * 0.16, 0.8, 0.2]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.065, 0.065, 0.07, 16]} />
              <Clay color={colors.text} />
            </mesh>
          ))}
          {[-1, 1].flatMap((side) =>
            [-1, 1].map((axle) => (
              <mesh
                key={`${side}:${axle}`}
                name="robot-wheel"
                position={[side * 0.43, 0.14, axle * 0.22]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.17, 0.17, 0.12, 16]} />
                <Clay color={colors.text} />
              </mesh>
            )),
          )}
        </group>
        {block(
          'parcel-target-source-existence',
          [1.4, -0.1, -0.3],
          [0.65, 0.6, 0.55],
          colors.accent,
          solid ? 1 : 0.2,
        )}
        {block('parcel-wrap', [1.4, -0.1, 0], [0.12, 0.62, 0.03], colors.text, solid ? 1 : 0.2)}
        {block(
          scene.template === 'robot-box' ? 'box-occluder' : 'panel-occluder',
          [0.3, -0.05, 0.2],
          [0.85, 1.1, scene.template === 'robot-box' ? 0.65 : 0.12],
          colors.muted,
          0.65,
        )}
      </group>
    );
  }
  return (
    <group
      name="gate-courtyard-authored-route"
      userData={{ schematic: true, factId: fact.id, permissionNotEvaluated: true }}
    >
      {Array.from({ length: 6 }, (_, i) =>
        block(
          `supplied-route-carrier-${i}`,
          [-1.55 + i * 0.62, -0.6, 0],
          [connectionState(scene, fact) === 'reference' ? 0.42 : 0.63, 0.12, 0.45],
          colors.muted,
          connectionState(scene, fact) === 'disconnected' && (i === 2 || i === 3) ? 0 : 1,
        ),
      )}
      {[-1, 1].map((side) =>
        block(`gate-post-${side}`, [-0.6, 0.05, side * 0.55], [0.15, 1.3, 0.15], colors.surface),
      )}
      {block('gate-header', [-0.6, 0.72, 0], [0.17, 0.15, 1.25], colors.surface)}
      {[0, 1, 2].map((i) =>
        block(
          `gate-schematic-bar-${i}`,
          [-0.6, 0.2, -0.35 + i * 0.35],
          [0.09, 0.8, 0.07],
          colors.muted,
        ),
      )}
      {block('courtyard-destination', [1.4, -0.55, 0], [1.1, 0.12, 1.2], colors.surface)}
      {block('courtyard-back-wall', [1.4, -0.15, -0.6], [1.1, 0.75, 0.1], colors.surface)}
      {scene.template === 'courtyard-route' &&
        block('courtyard-side-wall', [1.95, -0.15, 0], [0.1, 0.75, 1.2], colors.surface)}
      <mesh name="traveler-head" position={[-1.55, 0.13, 0]}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <Clay color={colors.accent} />
      </mesh>
      {block('traveler-body', [-1.55, -0.23, 0], [0.23, 0.45, 0.2], colors.accent)}
    </group>
  );
}
