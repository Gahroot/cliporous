/**
 * Production alpha overlay: consecutive approved scenes as panels on one moving whiteboard.
 * Each panel mounts the real scene body on its classic 1080×960 stage, starts on its own beat
 * and then holds its final pose, so the camera can travel back across the accumulated story.
 */
import type React from 'react';
import { useMemo } from 'react';
import { AbsoluteFill, Freeze, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneBody } from '../explainer/SceneBody';
import { ExplainerFonts, ExplainerProvider } from '../explainer/stage';
import { BoardFonts } from '../storyboard/BoardFonts';
import { worldTransform } from '../storyboard/camera';
import { BoardElementView } from '../storyboard/elements';
import { boardLook } from '../storyboard/look';
import { WorldTexture } from '../storyboard/StoryBoard';
import type { BoardElement } from '../storyboard/types';
import {
  buildCanvasLayout,
  canvasCameraAt,
  canvasOpacity,
  PANEL_PAD,
  type PanelBox,
  panelInView,
} from './geometry';
import type { SceneCanvasPanel, SceneCanvasProps } from './types';

const PanelStage: React.FC<{
  panel: SceneCanvasPanel;
  box: PanelBox;
  fps: number;
  totalFrames: number;
}> = ({ panel, box, fps, totalFrames }) => {
  const from = Math.round(panel.startSec * fps);
  const ownFrames = Math.max(1, Math.round((panel.endSec - panel.startSec) * fps));
  const last = ownFrames - 1;
  return (
    <Sequence from={from} durationInFrames={Math.max(1, totalFrames - from)} layout="none">
      <div
        data-canvas-panel={panel.id}
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
        }}
      >
        <Freeze frame={last} active={(f) => f >= last}>
          <SceneBody scene={panel.scene} />
        </Freeze>
      </div>
    </Sequence>
  );
};

export const SceneCanvas: React.FC<SceneCanvasProps> = ({
  style,
  palette,
  durationSec,
  panels,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const look = useMemo(() => boardLook(style, palette), [style, palette]);
  const layout = useMemo(() => buildCanvasLayout(panels, durationSec), [panels, durationSec]);
  const seed = useMemo(() => panels.map((p) => p.id).join('|'), [panels]);
  const chrome = useMemo<BoardElement[]>(
    () => [
      ...layout.panels.map(
        (box, i): BoardElement => ({
          id: `canvas-frame-${box.id}`,
          kind: 'frame',
          at: layout.frameAt[i] ?? 0,
          x: box.x - PANEL_PAD,
          y: box.y - PANEL_PAD,
          w: box.width + PANEL_PAD * 2,
          h: box.height + PANEL_PAD * 2,
        }),
      ),
      ...layout.connectors.map(
        (c, i): BoardElement => ({
          id: `canvas-link-${i}`,
          kind: 'arrow',
          at: c.at,
          dur: c.dur,
          from: c.from,
          to: c.to,
          bend: i % 2 === 0 ? 0.16 : -0.16,
          tone: 'muted',
        }),
      ),
    ],
    [layout],
  );
  const provider = useMemo(
    () => ({
      palette: look.palette,
      layout: 'stack' as const,
      aspect: '9:16' as const,
      presentation: undefined,
      nativeStage: false,
      extras: {},
    }),
    [look],
  );
  const cam = canvasCameraAt(layout, t, seed);
  const opacity = canvasOpacity(layout, t);
  return (
    <AbsoluteFill data-scene-canvas={style}>
      <BoardFonts />
      <ExplainerFonts />
      {opacity > 0 && (
        <AbsoluteFill
          style={{
            opacity,
            background: look.backdrop,
            overflow: 'hidden',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
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
              {chrome.map((el) => (
                <BoardElementView key={el.id} el={el} t={t} fps={fps} look={look} />
              ))}
              {panels.map((panel, i) => {
                const box = layout.panels[i];
                // Off-screen panels are skipped: every pose is frame-derived, so remounting is exact.
                if (!box || !panelInView(box, cam)) return null;
                return (
                  <PanelStage
                    key={panel.id}
                    panel={panel}
                    box={box}
                    fps={fps}
                    totalFrames={durationInFrames}
                  />
                );
              })}
            </div>
          </ExplainerProvider>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
