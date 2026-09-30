import type React from 'react';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Path, Shape } from 'three';
import { Clay } from './hero-kit';
import { ArchRig } from './hero-props/structures';
import { KEYSTONE_SUPPORT, sampleKeystone } from './mechanisms/keystone-poses';
import { MechanismStage, useCompactMechanism } from './mechanisms/MechanismStage';
import { RoundedBlock } from './mechanisms/primitives';
import { useSceneTime, useStage } from './stage';
import type { KeystoneScene as KeystoneData } from './types';

const C = KEYSTONE_SUPPORT;

export const KeystoneScene: React.FC<{ scene: KeystoneData }> = ({ scene }) => {
  const S = useStage();
  const compact = useCompactMechanism();
  const pose = sampleKeystone(useSceneTime().t, scene);
  const geometry = useMemo(() => {
    const inner = C.outerRadius - C.thickness;
    const shape = new Shape();
    shape.moveTo(C.outerRadius * Math.cos(C.endAngle), C.outerRadius * Math.sin(C.endAngle));
    shape.absarc(0, 0, C.outerRadius, C.endAngle, Math.PI - C.endAngle, false);
    shape.lineTo(inner * Math.cos(Math.PI - C.endAngle), inner * Math.sin(Math.PI - C.endAngle));
    let angle = Math.PI - C.endAngle;
    // Two flat-bottomed shoes are part of the curved centering itself, not overlapping meshes.
    for (const side of [-1, 1]) {
      const from = side * C.strutX - C.shoeHalfWidth;
      const to = side * C.strutX + C.shoeHalfWidth;
      shape.absarc(0, 0, inner, angle, Math.acos(from / inner), true);
      shape.lineTo(from, C.shoeBottom);
      shape.lineTo(to, C.shoeBottom);
      angle = Math.acos(to / inner);
      shape.lineTo(to, Math.sqrt(inner ** 2 - to ** 2));
    }
    shape.absarc(0, 0, inner, angle, C.endAngle, true);
    shape.closePath();
    const centering = new ExtrudeGeometry(shape, {
      depth: C.depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 32,
    });
    centering.translate(0, 0, -C.depth / 2);

    const tube = new Shape();
    tube.absarc(0, 0, C.sleeveRadius, 0, Math.PI * 2, false);
    const bore = new Path();
    bore.absarc(0, 0, C.sleeveBore, 0, Math.PI * 2, true);
    tube.holes.push(bore);
    const height = C.sleeveTopY - C.sleeveBottomY;
    const sleeve = new ExtrudeGeometry(tube, {
      depth: height,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 24,
    });
    sleeve.translate(0, 0, -height / 2);
    sleeve.rotateX(-Math.PI / 2);
    return { centering, sleeve };
  }, []);
  useEffect(
    () => () => {
      geometry.centering.dispose();
      geometry.sleeve.dispose();
    },
    [geometry],
  );

  // Compact cards use a slightly larger, near-frontal rig so the support gap stays legible.
  // Both framings leave room for the initially raised keystone below the source-only title.
  const scale = compact ? 1.48 : 1.44;
  return (
    <MechanismStage title={scene.label}>
      <group
        scale={scale}
        position={[0, -1.4 - C.footBottomY * scale, 0]}
        rotation={[0, compact ? -0.1 : -0.2, 0]}
      >
        <ArchRig {...pose.arch} />
        <mesh position={[0, pose.supportY, 0]}>
          <primitive object={geometry.centering} attach="geometry" dispose={null} />
          <Clay color={S.accent2} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * C.strutX, 0, 0]}>
            <RoundedBlock
              size={[C.footWidth, C.sleeveBottomY - C.footBottomY, C.footDepth]}
              at={[0, (C.sleeveBottomY + C.footBottomY) / 2, 0]}
              color={S.clay[1]}
            />
            <mesh position={[0, (C.sleeveTopY + C.sleeveBottomY) / 2, 0]}>
              <primitive object={geometry.sleeve} attach="geometry" dispose={null} />
              <Clay color={S.clay[2]} />
            </mesh>
            <mesh position={[0, pose.strutY, 0]}>
              <cylinderGeometry args={[C.strutRadius, C.strutRadius, C.strutLength, 20]} />
              <Clay color={S.accent2} />
            </mesh>
          </group>
        ))}
      </group>
    </MechanismStage>
  );
};
