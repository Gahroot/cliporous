import type { ReactElement } from 'react';
import { Clay } from '../../hero-kit';
import { TemporalTaskClay } from '../kits/temporal';
import type { ExpansionKitColors } from '../scene-types';
import { delayPhasePages, delayPhasePose, delayPhaseSignal } from './delay-phase-poses';
import type { ExpansionDelayPhaseScene } from './delay-phase-types';

/** Semantic carriers only. All precise quantities and curves stay on the persistent plane. */
export function DelayPhaseModels({
  scene,
  t,
  colors,
}: {
  scene: ExpansionDelayPhaseScene;
  t: number;
  colors: ExpansionKitColors;
}): ReactElement {
  const pose = delayPhasePose(scene, t);
  const page = delayPhasePages(scene)[pose.page];
  if (!page) throw new Error('Missing source page');
  const record = scene.records.find((r) => r.id === page.recordId);
  const signal =
    scene.storyId === '46' && page.actorId
      ? delayPhaseSignal(
          scene,
          page.actorId,
          t,
          record?.dimension === 'phase' ? record.id : undefined,
        )
      : null;
  if (scene.storyId === '46')
    return (
      <group
        userData={{
          template: 'teaching-cycle-dial',
          phaseAvailable: signal !== null,
          sourceTemplate: signal?.template,
          sourceEvidence: scene.evidence,
          quantityState: record?.quantity.state,
          representedPeriod: signal?.period,
          representedPhase: signal?.phase,
          referenceId: signal?.referenceId,
        }}
        rotation={[0.2, 0, 0]}
      >
        <mesh>
          <cylinderGeometry args={[0.8, 0.8, 0.1, 32]} />
          <Clay color={colors.surface} />
        </mesh>
        <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.74, 0.04, 8, 32]} />
          <Clay color={colors.muted} />
        </mesh>
        <group rotation={[0, signal ? -signal.angle : 0, 0]} visible={signal !== null}>
          <mesh position={[0, 0.13, -0.3]}>
            <boxGeometry args={[0.04, 0.05, 0.6]} />
            <Clay color={colors.accent} />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.08, 12, 8]} />
            <Clay color={colors.text} />
          </mesh>
        </group>
      </group>
    );
  return (
    <group
      userData={{
        meaning: 'independent-latency-throughput',
        quantitative: false,
        sourceEvidence: scene.evidence,
        quantityState: record?.quantity.state,
      }}
    >
      <TemporalTaskClay
        colors={colors}
        pose={pose}
        state="retained"
        position={[-1.2, 0, 0]}
        scale={0.7}
        interval={{
          id: `${scene.storyId}/latency-carrier`,
          label: 'Latency',
          kind: 'qualitative',
          qualifier: 'Schematic waiting interval',
        }}
        domain={[
          { numerator: 0, denominator: 1 },
          { numerator: 1, denominator: 1 },
        ]}
      />
      <mesh position={[-1.2, 0.45, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.05, 24]} />
        <Clay color={colors.surface} />
      </mesh>
      <mesh position={[-1.2, 0.5, -0.1]}>
        <boxGeometry args={[0.035, 0.05, 0.2]} />
        <Clay color={colors.accent} />
      </mesh>
      <group position={[1.1, 0, 0]}>
        <mesh>
          <boxGeometry args={[1.7, 0.12, 0.6]} />
          <Clay color={colors.muted} />
        </mesh>
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.7, 12]} />
            <Clay color={colors.surface} />
          </mesh>
        ))}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.5 + i * 0.45 + pose.action * 0.1, 0.24, 0]}>
            <boxGeometry args={[0.28, 0.28, 0.28]} />
            <Clay color={colors.accent} />
          </mesh>
        ))}
        <mesh position={[0.85, 0.2, 0]}>
          <coneGeometry args={[0.12, 0.25, 12]} />
          <Clay color={colors.text} />
        </mesh>
      </group>
    </group>
  );
}
