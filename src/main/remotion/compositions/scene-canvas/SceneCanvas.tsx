/**
 * Production alpha overlay: consecutive approved scenes as panels on one moving whiteboard.
 * Each panel mounts the real scene body on its classic 1080×960 stage and starts on its own beat;
 * after its animation settles it keeps a gentle frame-driven idle motion (see `idle.ts`), so the
 * camera travels across a living story rather than frozen frames.
 */
import type React from 'react';
import { useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Glow } from '../explainer/motion';
import { SceneBody } from '../explainer/SceneBody';
import { SceneOrbitContext } from '../explainer/Stage3D';
import { ExplainerFonts, ExplainerProvider } from '../explainer/stage';
import { BoardFonts } from '../storyboard/BoardFonts';
import { worldTransform } from '../storyboard/camera';
import { BoardElementView, writeDur } from '../storyboard/elements';
import { boardLook } from '../storyboard/look';
import { WorldTexture } from '../storyboard/StoryBoard';
import type { BoardElement } from '../storyboard/types';
import {
  buildCanvasLayout,
  canvasCameraAt,
  canvasOpacity,
  PANEL_PAD,
  type PanelBox,
  type PlacedNote,
  panelInView,
} from './geometry';
import { idleTransform, panelIdleAt, panelSettleSec } from './idle';
import type { SceneCanvasPanel, SceneCanvasProps } from './types';

/**
 * One panel: the real scene body keeps running past its own window (scene motion is purely
 * frame-driven and has no exit of its own), and once settled it gains a gentle float, tilt,
 * 3D turntable and periodic pulse so a finished panel never sits still on the board.
 */
const PanelStage: React.FC<{
  panel: SceneCanvasPanel;
  box: PanelBox;
  fps: number;
  frame: number;
  totalFrames: number;
  accent: string;
}> = ({ panel, box, fps, frame, totalFrames, accent }) => {
  const from = Math.round(panel.startSec * fps);
  const ownSec = panel.endSec - panel.startSec;
  const settle = panelSettleSec(panel.scene, ownSec);
  const idle = panelIdleAt((frame - from) / fps, settle, fps, panel.id);
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
          transform: idleTransform(idle),
          transformOrigin: '50% 55%',
        }}
      >
        <Glow color={accent} intensity={idle.glow} radius={260} />
        <SceneOrbitContext.Provider value={idle.orbitDeg}>
          <SceneBody scene={panel.scene} />
        </SceneOrbitContext.Provider>
      </div>
    </Sequence>
  );
};

/**
 * A board note as existing storyboard marks: handwriting with a marker swipe, ringed accent
 * handwriting, or a taped sticky note, each followed by a short arrow back to its panel.
 */
function noteElements(n: PlacedNote, ink: boolean): BoardElement[] {
  // Marks follow the handwriting, so the reader sees words first.
  const written = n.at + (ink ? writeDur(n.text) : 0.42);
  const arrow: BoardElement = {
    id: `${n.id}-arrow`,
    kind: 'arrow',
    at: written + 0.1,
    dur: 0.4,
    from: n.arrow.from,
    to: n.arrow.to,
    bend: 0.22,
    tone: 'muted',
  };
  if (n.style === 'sticky') {
    const rot = n.anchor % 2 === 0 ? -3 : 3;
    const note: BoardElement = {
      id: n.id,
      kind: 'note',
      at: n.at,
      x: n.x,
      y: n.y,
      rot,
      title: n.text,
      width: n.w,
      height: n.h,
      size: n.size,
    };
    return [note, arrow];
  }
  const text: BoardElement = {
    id: n.id,
    kind: 'text',
    at: n.at,
    // Ringed text sits centred in its ring whatever the font's real width.
    x: n.style === 'circled' ? n.x + n.w / 2 : n.x,
    y: n.y,
    text: n.text,
    size: n.size,
    width: n.w + 4,
    tone: n.style === 'circled' ? 'accent' : 'ink',
    align: n.style === 'circled' ? 'center' : 'left',
    ...(n.style === 'write' ? { highlightAt: written + 0.05 } : {}),
  };
  if (n.style === 'write') return [text, arrow];
  const ring: BoardElement = {
    id: `${n.id}-ring`,
    kind: 'ring',
    at: written + 0.05,
    cx: n.x + n.w / 2,
    cy: n.y + n.h / 2,
    rx: n.w / 2 + 34,
    ry: n.h / 2 + 30,
  };
  return [text, ring, { ...arrow, at: written + 0.55 }];
}

export const SceneCanvas: React.FC<SceneCanvasProps> = ({
  style,
  palette,
  durationSec,
  panels,
  notes = [],
  closeBySec,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const look = useMemo(() => boardLook(style, palette), [style, palette]);
  const layout = useMemo(
    () => buildCanvasLayout(panels, durationSec, notes, closeBySec ?? durationSec),
    [panels, durationSec, notes, closeBySec],
  );
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
      ...layout.notes.flatMap((n) => noteElements(n, look.skin === 'ink')),
    ],
    [layout, look],
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
                    frame={frame}
                    totalFrames={durationInFrames}
                    accent={look.accent}
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
