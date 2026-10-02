/** Production alpha overlay. Input times are already segment-local; never rebase them here. */
import type React from 'react';
import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ExplainerProvider } from '../explainer/stage';
import { BoardFonts } from './BoardFonts';
import { BoardPropShadows, BoardProps3D } from './BoardProps3D';
import { assertStoryboardBudgets } from './budgets';
import { boardOpacity, type CameraPose, cameraAt, worldTransform } from './camera';
import { BoardElementView } from './elements';
import { type BoardLook, boardLook } from './look';
import { visibleBoardProps } from './prop-state';
import type { ProductionStoryBoardProps } from './types';

/** Viewport-sized repeating texture: no world-sized noise filter, canvas or raster allocation. */
export const WorldTexture: React.FC<{
  look: BoardLook;
  cam: CameraPose;
  width: number;
  height: number;
}> = ({ look, cam, width, height }) => {
  const cell = (look.skin === 'ink' ? 32 : 44) * cam.zoom;
  const x = width / 2 - cam.x * cam.zoom;
  const y = height / 2 - cam.y * cam.zoom;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: look.skin === 'ink' ? 0.045 : 0.09,
        backgroundImage:
          look.skin === 'ink'
            ? `linear-gradient(96deg, ${look.line} 0.5px, transparent 0.5px), linear-gradient(3deg, ${look.line} 0.5px, transparent 0.5px)`
            : `radial-gradient(circle, ${look.line} 1px, transparent 1.5px)`,
        backgroundSize: `${cell}px ${cell}px`,
        backgroundPosition: `${x}px ${y}px`,
      }}
    />
  );
};

export const StoryBoard: React.FC<ProductionStoryBoardProps> = ({ spec, style, palette }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const look = useMemo(() => boardLook(style, palette), [style, palette]);
  useMemo(() => assertStoryboardBudgets(spec), [spec]);
  const cam = cameraAt(spec.shots, t);
  const opacity = boardOpacity(spec, t);
  const provider = useMemo(() => ({ palette: look.palette }), [look]);
  const visible = visibleBoardProps(spec.props, spec.elements, cam, t, width, height);
  return (
    <AbsoluteFill data-storyboard-canvas={style}>
      <BoardFonts />
      {opacity > 0 && (
        <AbsoluteFill style={{ opacity, background: look.backdrop, overflow: 'hidden' }}>
          <ExplainerProvider value={provider}>
            <WorldTexture look={look} cam={cam} width={width} height={height} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: worldTransform(cam, width, height),
                transformOrigin: '0 0',
              }}
            >
              <BoardPropShadows visible={visible} color={look.shadow} glowColor={look.highlight} />
              {spec.elements.map((el) => (
                <BoardElementView key={el.id} el={el} t={t} fps={fps} look={look} />
              ))}
            </div>
            <BoardProps3D
              props={spec.props}
              elements={spec.elements}
              cam={cam}
              t={t}
              width={width}
              height={height}
            />
          </ExplainerProvider>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
