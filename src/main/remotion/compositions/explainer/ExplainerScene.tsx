/**
 * ExplainerScene — legacy single-scene composition (v1 props). Kept so old
 * callers and the Remotion Studio preview keep working; new renders use
 * `ExplainerSequence`.
 */

import type React from 'react';
import { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { deriveExplainerPalette } from './palette';
import { SceneBody } from './SceneBody';
import { SceneFrame } from './SceneFrame';
import { ExplainerFonts, ExplainerProvider, StageBackground, UI_FONT, useEntrance } from './stage';
import type { ExplainerSceneProps } from './types';

export const ExplainerScene: React.FC<ExplainerSceneProps> = ({
  scene,
  accentColor,
  palette,
  layout = 'stack',
  aspect = '9:16',
}) => {
  const entrance = useEntrance();
  const ctx = useMemo(
    () => ({
      palette:
        palette ??
        deriveExplainerPalette({
          background: '#0a0f1f',
          foreground: '#eef1f8',
          accent: accentColor,
        }),
      layout,
      aspect,
    }),
    [palette, accentColor, layout, aspect],
  );

  return (
    <ExplainerProvider value={ctx}>
      <AbsoluteFill
        style={{
          backgroundColor: layout === 'over' ? 'transparent' : ctx.palette.bgOuter,
          fontFamily: UI_FONT,
        }}
      >
        <ExplainerFonts />
        <StageBackground />
        <AbsoluteFill style={entrance}>
          <SceneFrame scene={scene}>
            <SceneBody scene={scene} />
          </SceneFrame>
        </AbsoluteFill>
      </AbsoluteFill>
    </ExplainerProvider>
  );
};
