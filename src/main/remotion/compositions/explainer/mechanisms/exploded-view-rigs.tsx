import type React from 'react';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry } from 'three';
import { Clay } from '../hero-kit';
import { gearShape } from '../hero-props/mechanics';
import { useStage } from '../stage';
import type { ExplodedPartPose } from './exploded-view-poses';

const AssemblyGear: React.FC<{ opacity: number }> = ({ opacity }) => {
  const S = useStage();
  const geometry = useMemo(() => {
    const g = new ExtrudeGeometry(gearShape(14, 0.13, 3), {
      depth: 0.18,
      bevelEnabled: false,
      curveSegments: 20,
    });
    g.computeBoundingBox();
    const box = g.boundingBox;
    if (box) g.scale(1.3 / (box.max.x - box.min.x), 1.3 / (box.max.y - box.min.y), 1);
    g.center();
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <Clay color={S.accent} opacity={opacity} />
    </mesh>
  );
};

/** Origin-centred authored part. Main assembly and magnified inset render THIS SAME model. */
export const ExplodedPartRig: React.FC<{ part: ExplodedPartPose; opacity?: number }> = ({
  part,
  opacity = 1,
}) => {
  const S = useStage();
  const [w, h, d] = part.size;
  switch (part.id) {
    case 'gear':
      return <AssemblyGear opacity={opacity} />;
    case 'shaft':
      return (
        <mesh>
          <cylinderGeometry args={[w / 2, w / 2, h, 24]} />
          <Clay color={S.clay[2]} metalness={0.2} opacity={opacity} />
        </mesh>
      );
    case 'base':
      return (
        <group>
          <mesh position={[0, -h / 2 + 0.03, 0]}>
            <boxGeometry args={[w, 0.06, d]} />
            <Clay color={S.clay[0]} opacity={opacity} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * (w / 2 - 0.03), 0.03, 0]}>
                <boxGeometry args={[0.06, h - 0.06, d]} />
                <Clay color={S.clay[0]} opacity={opacity} />
              </mesh>
              <mesh position={[0, 0.03, side * (d / 2 - 0.03)]}>
                <boxGeometry args={[w - 0.12, h - 0.06, 0.06]} />
                <Clay color={S.clay[0]} opacity={opacity} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'contents':
      return (
        <group>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, -h / 2 + ((i + 0.5) * h) / 4, 0]}>
              <boxGeometry args={[w, h / 4, d]} />
              <Clay color={i % 2 ? S.paper : S.clay[1]} opacity={opacity} />
            </mesh>
          ))}
        </group>
      );
    case 'chip':
      return (
        <group>
          <mesh>
            <boxGeometry args={[w * 0.78, h, d * 0.78]} />
            <Clay color={S.clay[2]} opacity={opacity} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              {[-0.25, 0, 0.25].map((p) => (
                <group key={p}>
                  <mesh position={[side * w * 0.445, -h * 0.3, p * d]}>
                    <boxGeometry args={[w * 0.11, h * 0.2, 0.06]} />
                    <Clay color={S.paper} opacity={opacity} />
                  </mesh>
                  <mesh position={[p * w, -h * 0.3, side * d * 0.445]}>
                    <boxGeometry args={[0.06, h * 0.2, d * 0.11]} />
                    <Clay color={S.paper} opacity={opacity} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}
          <mesh position={[0, h / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w * 0.35, d * 0.35]} />
            <Clay color={S.accent} opacity={opacity} />
          </mesh>
        </group>
      );
    case 'heatsink':
      return (
        <group>
          <mesh position={[0, -h / 2 + 0.04, 0]}>
            <boxGeometry args={[w, 0.08, d]} />
            <Clay color={S.clay[1]} opacity={opacity} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <mesh key={i} position={[-w / 2 + 0.045 + (i * (w - 0.09)) / 6, 0.04, 0]}>
              <boxGeometry args={[0.09, h - 0.08, d]} />
              <Clay color={S.clay[1]} opacity={opacity} />
            </mesh>
          ))}
        </group>
      );
    case 'housing':
    case 'lid':
    case 'board':
      return (
        <group>
          <mesh>
            <boxGeometry args={[w, h, d]} />
            <Clay color={part.id === 'board' ? S.positive : S.clay[0]} opacity={opacity} />
          </mesh>
          {part.id === 'board' &&
            [-1, 1].map((side) => (
              <mesh key={side} position={[side * w * 0.3, h / 2 + 0.002, 0]}>
                <boxGeometry args={[0.025, 0.004, d * 0.75]} />
                <Clay color={S.accent2} opacity={opacity} />
              </mesh>
            ))}
          {part.id === 'housing' &&
            [-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * w * 0.38, 0, d / 2]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.05, 0.05, 0.006, 12]} />
                <Clay color={S.clay[2]} opacity={opacity} />
              </mesh>
            ))}
        </group>
      );
  }
};
