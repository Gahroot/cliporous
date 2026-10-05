import type React from 'react';
import { EXPLANATION_CAMERA } from '../explanation-layout';
import { Stage3D } from '../Stage3D';
import { useSceneTime } from '../stage';
import type { CameraSpec } from '../three-helpers';
import { DiagramChrome, DiagramStage, DiagramSurface } from './DiagramStage';
import { diagramPose } from './motion';
import type { DiagramStory } from './types';

/** Pure layer selection: null diagrams must not create an empty extra SVG surface. */
export function hybridDiagramLayer(
  diagram: React.ReactNode,
  opacity: number,
): React.ReactElement | null {
  return diagram === null || diagram === undefined ? null : (
    <DiagramSurface opacity={opacity}>{diagram}</DiagramSurface>
  );
}

/**
 * One existing studio, then an authored same-subject crossfade into the complete diagram.
 * Stage3D and DiagramSurface share the same native model rectangle in landscape;
 * DiagramChrome stays in the separate text rail throughout the handoff.
 */
export function HybridStage({
  scene,
  model,
  diagram,
  camera = EXPLANATION_CAMERA,
  handoffBeat = 'response',
}: {
  scene: DiagramStory;
  model: React.ReactNode;
  diagram: React.ReactNode;
  camera?: CameraSpec;
  handoffBeat?: 'action' | 'response';
}): React.ReactElement {
  const { t } = useSceneTime();
  const pose = diagramPose(t, scene, handoffBeat);
  if (scene.visualMode === 'diagram') return <DiagramStage scene={scene}>{diagram}</DiagramStage>;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, opacity: pose.modelOpacity * pose.setup }}>
        <Stage3D
          camera={camera}
          driftDeg={0}
          pushAmount={0}
          bobAmount={0}
          groundY={-1.4}
          shadowScale={9}
        >
          <group rotation={[0, pose.modelTurn, 0]}>{model}</group>
        </Stage3D>
      </div>
      {hybridDiagramLayer(diagram, pose.diagramOpacity)}
      <DiagramChrome scene={scene} />
    </>
  );
}
