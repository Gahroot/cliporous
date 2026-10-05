import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import type { ExpansionKitColors } from '../scene-types';
import type { SectionUnfoldPose } from './section-unfold-poses';
import type { ExpansionSectionUnfoldScene } from './section-unfold-types';

/** Fixed authored dimensions; quoted measurements never enter this model. */
export function SectionUnfoldModels({
  scene,
  pose,
  colors,
}: {
  scene: ExpansionSectionUnfoldScene;
  pose: SectionUnfoldPose;
  colors: ExpansionKitColors;
}): ReactElement {
  const block = (
    id: string,
    position: [number, number, number],
    size: [number, number, number],
    color: string,
    opacity = 1,
    rotation: [number, number, number] = [0, 0, 0],
  ) => (
    <mesh key={id} position={position} rotation={rotation} userData={{ authoredId: id }}>
      <boxGeometry args={size} />
      <Clay color={color} opacity={opacity} />
    </mesh>
  );
  if (scene.storyId === '58') {
    const angle = ((1 - pose.fold) * Math.PI) / 2;
    const panel = (name: string, position: [number, number, number]) =>
      block(
        scene.faces.find((f) => f.face === name)?.id ?? name,
        position,
        [1, 1, 0.035],
        name === 'front' ? colors.accent : colors.surface,
      );
    return (
      <group
        scale={1.25}
        position={[0, -0.4, 0]}
        userData={{ template: 'cube-cross', correspondenceIds: pose.correspondenceIds }}
      >
        <group position={[0, 0, 0.5]}>
          {panel('front', [0, 0, 0])}
          <group position={[0.5, 0, 0]} rotation={[0, angle, 0]}>
            {panel('right', [0.5, 0, 0])}
          </group>
          <group position={[-0.5, 0, 0]} rotation={[0, -angle, 0]}>
            {panel('left', [-0.5, 0, 0])}
          </group>
          <group position={[0, -0.5, 0]} rotation={[angle, 0, 0]}>
            {panel('bottom', [0, -0.5, 0])}
          </group>
          <group position={[0, 0.5, 0]} rotation={[-angle, 0, 0]}>
            {panel('top', [0, 0.5, 0])}
            <group position={[0, 1, 0]} rotation={[-angle, 0, 0]}>
              {panel('back', [0, 0.5, 0])}
            </group>
          </group>
        </group>
      </group>
    );
  }
  const open = 'value' in scene.section && scene.section.value === 'intersects' ? pose.sweep : 0;
  const shell: ReactElement[] = [];
  if (scene.template === 'cylinder') {
    shell.push(
      <mesh key="tube" position={[0, -0.1, 0]}>
        <cylinderGeometry
          args={[1.05, 1.05, 2.1, 24, 1, true, Math.PI * open, Math.PI * (2 - open)]}
        />
        <Clay color={colors.surface} />
      </mesh>,
    );
    shell.push(
      <mesh key="base" position={[0, -1.15, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.1, 24]} />
        <Clay color={colors.muted} />
      </mesh>,
    );
  } else {
    shell.push(
      block('floor', [0, -1.15, 0], [2.8, 0.12, 1.6], colors.surface),
      block('rear', [0, 0, -0.75], [2.8, 2.3, 0.12], colors.surface),
      block('left-shell', [-1.34, 0, 0], [0.12, 2.3, 1.6], colors.surface),
      block('right-shell', [1.34, 0, 0], [0.12, 2.3, 1.6], colors.surface),
      block('front-shell', [2.8 * open, 0, 0.75], [2.8, 2.3, 0.1], colors.surface, 1 - open),
    );
    if (scene.template === 'house')
      shell.push(
        block('roof-left', [-0.7, 1.4, 0], [1.7, 0.13, 1.9], colors.muted, 1, [0, 0, Math.PI / 6]),
        block('roof-right', [0.7, 1.4, 0], [1.7, 0.13, 1.9], colors.muted, 1, [0, 0, -Math.PI / 6]),
      );
  }
  const parts = scene.parts.flatMap((part) => {
    if (!('value' in part) || part.value === 'absent') return [];
    const opacity = pose.visibleIds.includes(part.id)
      ? 1
      : pose.revealedIds.includes(part.id)
        ? pose.response
        : 0;
    const id = part.id;
    switch (part.part) {
      case 'board':
        return [
          block(id, [0, 0.25, 0], [1.8, 1.2, 0.12], colors.accent, opacity),
          block(`${id}:chip`, [0.15, 0.35, 0.1], [0.45, 0.4, 0.16], colors.text, opacity),
        ];
      case 'cell':
        return [
          <mesh key={id} position={[-0.8, -0.6, 0.15]} userData={{ partId: id }}>
            <cylinderGeometry args={[0.23, 0.23, 0.65, 16]} />
            <Clay color={colors.accent} opacity={opacity} />
          </mesh>,
        ];
      case 'drive':
        return [
          <mesh
            key={id}
            position={[0.75, -0.6, 0.15]}
            rotation={[Math.PI / 2, 0, 0]}
            userData={{ partId: id }}
          >
            <cylinderGeometry args={[0.36, 0.36, 0.15, 20]} />
            <Clay color={colors.accent} opacity={opacity} />
          </mesh>,
        ];
      case 'port':
        return [block(id, [0.9, 0.6, 0.15], [0.45, 0.24, 0.35], colors.muted, opacity)];
      case 'shaft':
        return [
          <mesh key={id} position={[0, -0.1, 0]} userData={{ partId: id }}>
            <cylinderGeometry args={[0.16, 0.16, 1.8, 16]} />
            <Clay color={colors.accent} opacity={opacity} />
          </mesh>,
        ];
      case 'core':
        return [block(id, [0, -0.1, 0], [0.75, 0.8, 0.65], colors.accent, opacity)];
      case 'insert':
        return [block(id, [0, -0.7, 0], [1.6, 0.2, 1.2], colors.accent, opacity)];
      case 'partition':
        return [block(id, [-0.3, -0.2, 0], [0.12, 1.8, 1.4], colors.accent, opacity)];
      case 'beam':
        return [block(id, [0, 0.8, 0], [2.2, 0.18, 0.18], colors.accent, opacity)];
      case 'valve':
        return [
          <mesh key={id} position={[0.75, -0.5, 0.35]} userData={{ partId: id }}>
            <torusGeometry args={[0.22, 0.055, 8, 16]} />
            <Clay color={colors.accent} opacity={opacity} />
          </mesh>,
          block(`${id}:pipe`, [0.75, -0.65, 0], [0.1, 0.8, 0.1], colors.muted, opacity),
        ];
    }
    throw new Error('Unauthored section part');
  });
  return (
    <group userData={{ template: scene.template, sectionId: scene.section.id }}>
      {shell}
      {parts}
      {block('section-plane', [-1.3 + open * 2.6, 0, 0], [0.025, 2.2, 1.7], colors.accent, 0.25)}
    </group>
  );
}
