import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import { useWideStage } from '../../stage';
import { type CameraSpec, worldUnitsPerPixel } from '../../three-helpers';
import { SignalInstrumentClay, SignalTraceClay } from '../kits/signals';
import type { ExpansionKitColors } from '../scene-types';
import {
  interferenceCycleEligibility,
  interferenceCyclePose,
  interferenceCycleWaves,
} from './interference-cycle-poses';
import type { ExpansionInterferenceCycleScene } from './interference-cycle-types';

export const INTERFERENCE_CYCLE_CAMERA: CameraSpec = { position: [0, 0, 10], fov: 48 };
export function interferenceCycleModelPlacement(
  index: number,
  count: number,
  wide?: { width: number; height: number },
): { position: [number, number, number]; scale: number } {
  const width = wide?.width ?? 1080,
    height = wide?.height ?? 960;
  const meet = wide ? Math.min(width / 952, height / 478) : 1;
  const cx = ((index + 0.5) * 900) / count + 26;
  const x = wide ? (width - 952 * meet) / 2 + cx * meet : 64 + cx;
  const y = wide ? (height - 478 * meet) / 2 + 195 * meet : 262 + 195;
  const units = worldUnitsPerPixel(INTERFERENCE_CYCLE_CAMERA, height);
  return {
    position: [(x - width / 2) * units, (height / 2 - y) * units, 0] as [number, number, number],
    scale: units * meet * 20,
  };
}
/** Semantic teaching rigs only: editorial reveal is not a physical phase/state simulation. */
export function InterferenceCycleModels({
  scene,
  t,
  colors,
}: {
  scene: ExpansionInterferenceCycleScene;
  t: number;
  colors: ExpansionKitColors;
}): ReactElement {
  const wide = useWideStage();
  const pose = interferenceCyclePose(scene, t);
  const waves = interferenceCycleWaves(scene);
  const eligibility = interferenceCycleEligibility(scene);
  const count = scene.storyId === '77' ? 2 : 3;
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const p = interferenceCycleModelPlacement(i, count, wide?.model);
        if (scene.storyId === '77') {
          const w = scene.waves[i];
          const common = {
            id: w.id,
            label: scene.entities[i + 1].label,
            provenance: {
              kind: 'illustrative' as const,
              qualifier: 'Analytic teaching rig, not measured',
            },
            colors,
            pose,
            position: [0, 0, 0] as const,
          };
          return (
            <group key={w.id} position={p.position} scale={p.scale}>
              {waves && eligibility === 'supported' ? (
                <SignalTraceClay {...common} wave={waves[i]} state="retained" />
              ) : (
                <SignalInstrumentClay
                  {...common}
                  state={eligibility === 'parameters-unavailable' ? 'unknown' : 'retained'}
                />
              )}
            </group>
          );
        }
        const r = scene.records[i];
        const materialState = i === 0 ? r.value : r.value?.split(' ')[2];
        return (
          <group
            key={r.id}
            position={p.position}
            scale={p.scale}
            userData={{ role: r.role, state: r.state, sourceValue: r.value }}
          >
            <mesh>
              <cylinderGeometry args={[0.5, 0.5, 0.08, 24]} />
              <Clay color={colors.surface} />
            </mesh>
            <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.45, 0.04, 8, 24]} />
              <Clay color={colors.muted} />
            </mesh>
            <mesh position={[0, 0.3, 0]} visible={materialState === 'solid'}>
              <boxGeometry args={[0.38, 0.38, 0.38]} />
              <Clay color={colors.accent} />
            </mesh>
            <mesh position={[0, 0.14, 0]} visible={materialState === 'liquid'}>
              <cylinderGeometry args={[0.37, 0.37, 0.08, 24]} />
              <Clay color={colors.accent} />
            </mesh>
            {[-0.2, 0, 0.2].map((x, j) => (
              <mesh key={x} position={[x, 0.28 + j * 0.12, 0]} visible={materialState === 'gas'}>
                <sphereGeometry args={[0.07, 12, 8]} />
                <Clay color={colors.accent} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}
