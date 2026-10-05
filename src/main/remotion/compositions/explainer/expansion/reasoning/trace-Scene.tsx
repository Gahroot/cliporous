import type { ReactElement } from 'react';
import { DiagramStage } from '../../diagrams/DiagramStage';
import { Stage3D } from '../../Stage3D';
import { useSceneTime, useStage, useWideStage } from '../../stage';
import type { ExpansionKitColors } from '../scene-types';
import { TraceDiagram } from './trace-Diagram';
import { TraceModels } from './trace-models';
import { TRACE_CAMERA, TRACE_DEFAULT_VIEWPORT, type TraceViewport } from './trace-poses';
import type { ReasoningTraceScene } from './trace-types';

/** Inspectable authored tree. One studio in hybrid, none in diagram; precision labels are always planar. */
export function ReasoningTraceFrame({
  scene,
  t,
  colors,
  viewport = TRACE_DEFAULT_VIEWPORT,
}: {
  scene: ReasoningTraceScene;
  t: number;
  colors: ExpansionKitColors;
  viewport?: TraceViewport;
}): ReactElement {
  const diagram = (
    <DiagramStage scene={scene}>
      <TraceDiagram scene={scene} t={t} />
    </DiagramStage>
  );
  if (scene.visualMode === 'diagram') return diagram;
  return (
    <>
      <Stage3D
        camera={TRACE_CAMERA}
        driftDeg={0}
        pushAmount={0}
        bobAmount={0}
        groundY={-1.4}
        shadowScale={9}
      >
        <TraceModels scene={scene} t={t} colors={colors} viewport={viewport} />
      </Stage3D>
      {diagram}
    </>
  );
}
export function ReasoningTraceView({ scene }: { scene: ReasoningTraceScene }): ReactElement {
  const { t } = useSceneTime();
  const S = useStage();
  const wide = useWideStage();
  const viewport = wide
    ? {
        width: wide.model.width,
        height: wide.model.height,
        surface: { x: 0, y: 0, width: wide.model.width, height: wide.model.height },
      }
    : TRACE_DEFAULT_VIEWPORT;
  return (
    <ReasoningTraceFrame
      scene={scene}
      t={t}
      viewport={viewport}
      colors={{ surface: S.card, text: S.text, accent: S.accent, muted: S.muted }}
    />
  );
}
