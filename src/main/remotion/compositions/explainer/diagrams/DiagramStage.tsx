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
  leading = 1.15,
  lines,
}: {
  region: DiagramRect;
  text: string;
  size: number;
  columns: number;
  opacity?: number;
  strong?: boolean;
  leading?: number;
  lines?: readonly string[];
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
        lineHeight: leading,
        textAlign: 'center',
        opacity,
      }}
    >
      {(lines ?? labelLines(text, columns)).map((line, i) => (
        <div key={`${i}-${line}`}>{line}</div>
      ))}
    </div>
  );
}

export function DiagramChrome({
  scene,
  settledOutcome = false,
}: {
  scene: DiagramStory;
  settledOutcome?: boolean;
}): React.ReactElement {
  const { t } = useSceneTime();
  const pose = diagramPose(t, scene);
  // Opt-in source stories reserve resolveAt onward as a fully settled reading hold.
  // The default preserves historical appearances; no source beat is moved.
  const outcomeOpacity = settledOutcome ? (t >= scene.resolveAt ? 1 : 0) : pose.resolve;
  const wide = useWideStage();
  // New bounded stories may contain 96-character conditions. Preserve all characters
  // at the existing 24px size and within the unchanged 80px reservation. Legacy
  // scenes keep their existing word wrapping and spacing.
  const compactCondition = 'storyId' in scene && labelLines(scene.condition ?? '', 38).length > 2;
  const conditionChars = compactCondition ? Array.from(scene.condition ?? '') : [];
  const conditionLines = compactCondition
    ? Array.from({ length: Math.ceil(conditionChars.length / 38) }, (_, index) =>
        conditionChars.slice(index * 38, (index + 1) * 38).join(''),
      )
    : undefined;
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
        <WideStageText slot="outcome" text={scene.outcome} size={36} opacity={outcomeOpacity} />
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
          leading={compactCondition ? 1.1 : 1.15}
          lines={conditionLines}
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
        opacity={outcomeOpacity}
      />
    </>
  );
}

/** No Stage3D import or canvas. Complete presentation, not a fallback. */
export function DiagramStage({
  scene,
  children,
  settledOutcome = false,
}: {
  scene: DiagramStory;
  children: React.ReactNode;
  settledOutcome?: boolean;
}): React.ReactElement {
  return (
    <>
      <DiagramSurface>{children}</DiagramSurface>
      <DiagramChrome scene={scene} settledOutcome={settledOutcome} />
    </>
  );
}

export function DiagramSurface({
  children,
  opacity = 1,
}: {
  // Optional so createElement callers can pass children positionally (which
  // noChildrenProp requires) without needing a props-object `children` key.
  children?: React.ReactNode;
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
