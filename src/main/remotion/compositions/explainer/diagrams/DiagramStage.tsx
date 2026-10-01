import type React from 'react';
import { StageSpace, useSceneTime, useStage, useWideStage, WideStageText } from '../stage';
import { DIAGRAM_REGIONS, labelLines } from './layout';
import { diagramPose } from './motion';
import type { DiagramRect, DiagramStory } from './types';

function StageText({
  region,
  text,
  size,
  columns,
  opacity = 1,
  strong = false,
}: {
  region: DiagramRect;
  text: string;
  size: number;
  columns: number;
  opacity?: number;
  strong?: boolean;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        left: region.x,
        top: region.y,
        width: region.width,
        color: S.text,
        fontFamily: S.font,
        fontSize: size,
        fontWeight: strong ? 750 : 550,
        lineHeight: 1.15,
        textAlign: 'center',
        opacity,
      }}
    >
      {labelLines(text, columns).map((line, i) => (
        <div key={`${i}-${line}`}>{line}</div>
      ))}
    </div>
  );
}

export function DiagramChrome({ scene }: { scene: DiagramStory }): React.ReactElement {
  const { t } = useSceneTime();
  const pose = diagramPose(t, scene);
  const wide = useWideStage();
  if (wide)
    return (
      <>
        <WideStageText slot="title" text={scene.label} size={48} />
        {scene.condition && <WideStageText slot="condition" text={scene.condition} size={28} />}
        <WideStageText
          slot="evidence"
          text={scene.evidence === 'illustrative' ? 'Illustrative example' : 'Source-stated'}
          size={28}
        />
        <WideStageText slot="outcome" text={scene.outcome} size={36} opacity={pose.resolve} />
      </>
    );
  return (
    <>
      <StageText region={DIAGRAM_REGIONS.title} text={scene.label} size={38} columns={24} strong />
      {scene.condition && (
        <StageText
          region={DIAGRAM_REGIONS.condition}
          text={scene.condition}
          size={24}
          columns={38}
        />
      )}
      <StageText
        region={DIAGRAM_REGIONS.evidence}
        text={scene.evidence === 'illustrative' ? 'Illustrative example' : 'Source-stated'}
        size={28}
        columns={32}
      />
      <StageText
        region={DIAGRAM_REGIONS.outcome}
        text={scene.outcome}
        size={34}
        columns={27}
        strong
        opacity={pose.resolve}
      />
    </>
  );
}

/** No Stage3D import or canvas. Complete presentation, not a fallback. */
export function DiagramStage({
  scene,
  children,
}: {
  scene: DiagramStory;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <DiagramSurface>{children}</DiagramSurface>
      <DiagramChrome scene={scene} />
    </>
  );
}

export function DiagramSurface({
  children,
  opacity = 1,
}: {
  children: React.ReactNode;
  opacity?: number;
}): React.ReactElement {
  const wide = useWideStage();
  const b = wide?.model ?? DIAGRAM_REGIONS.body;
  return (
    <StageSpace>
      <svg
        role="img"
        aria-label="Source-grounded explanation"
        viewBox="0 0 952 478"
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: 'absolute',
          left: b.x,
          top: b.y,
          width: b.width,
          height: b.height,
          opacity,
          overflow: wide ? 'hidden' : 'visible',
        }}
      >
        {children}
      </svg>
    </StageSpace>
  );
}
