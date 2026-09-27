/**
 * ExplainerScene — the 1080×960 "stage" composition rendered into the top half
 * of a split 9:16 short. Dispatches on `scene.kind`.
 *
 * Rendered opaque (H.264) — the stage owns its navy background, so no alpha
 * pass is needed; the segment layout vstacks it above the speaker. There is no
 * fade-out: renders are padded past the segment end (boundaries can shift a
 * few frames at concat time) and the cut back to the speaker is a hard cut.
 */

import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { ChecklistScene } from './ChecklistScene';
import { FlowScene } from './FlowScene';
import { StackScene } from './StackScene';
import { StampScene } from './StampScene';
import { ExplainerFonts, STAGE, StageBackground, useEntrance } from './stage';
import type { ExplainerSceneProps } from './types';
import { VersusScene } from './VersusScene';

const SceneBody: React.FC<ExplainerSceneProps> = ({ scene, accentColor }) => {
  switch (scene.kind) {
    case 'checklist':
      return <ChecklistScene scene={scene} />;
    case 'versus':
      return <VersusScene scene={scene} accent={accentColor} />;
    case 'stamp':
      return <StampScene scene={scene} accent={accentColor} />;
    case 'flow':
      return <FlowScene scene={scene} accent={accentColor} />;
    case 'stack':
      return <StackScene scene={scene} accent={accentColor} />;
  }
};

export const ExplainerScene: React.FC<ExplainerSceneProps> = (props) => {
  const entrance = useEntrance();

  return (
    <AbsoluteFill style={{ backgroundColor: STAGE.bgOuter, fontFamily: STAGE.font }}>
      <ExplainerFonts />
      <StageBackground />
      <AbsoluteFill style={entrance}>
        <SceneBody {...props} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
