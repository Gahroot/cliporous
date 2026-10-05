/** One transparent WebGL stage for all visible props; none for a pure 2D board. */
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import type React from 'react';
import { useLayoutEffect } from 'react';
import { Freeze, useVideoConfig } from 'remotion';
import { HERO_PROP_DEFS, LightbulbRig } from '../explainer/HeroProps';
import { StudioEnvironment } from '../explainer/StudioEnvironment';
import { ExplainerProvider, useStage } from '../explainer/stage';
import { type BusinessModelRail, visibleBusinessPanels } from './business-panel-state';
import { BoardBusinessModels } from './business-panels';
import type { BoardBusinessPanel } from './business-types';
import { type CameraPose, worldToScreen } from './camera';
import { assertModelBudget } from './model-resources';
import {
  actionClock,
  BOARD_CAMERA_FOV,
  boardCanvasCount,
  MODEL_BOX,
  pixelCameraDistance,
  supportedModel,
  type VisibleProp,
  visibleBoardProps,
} from './prop-state';
import type { BoardElement, BoardProp } from './types';

export { propPose } from './prop-state';

const PixelCamera: React.FC<{ height: number }> = ({ height }) => {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const distance = pixelCameraDistance(height);
    camera.position.set(0, 0, distance);
    camera.near = 10;
    camera.far = distance * 4;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, height]);
  return null;
};

const PropModel: React.FC<{ entry: VisibleProp; t: number; fps: number }> = ({
  entry: { prop, pose },
  t,
  fps,
}) => {
  const model = supportedModel(prop);
  const clock = actionClock(prop, t, fps);
  const Model = HERO_PROP_DEFS[model].Model;
  // Freeze also overrides useCurrentFrame in models with springs (not just useSceneTime).
  return (
    <Freeze frame={clock.frame}>
      {model === 'lightbulb' ? (
        <LightbulbRig glow={pose.glow} />
      ) : (
        <Model at={0} tone={clock.tone} />
      )}
    </Freeze>
  );
};

export const BoardProps3D: React.FC<{
  props: readonly BoardProp[];
  elements: readonly BoardElement[];
  businessPanels?: readonly BoardBusinessPanel[];
  cam: CameraPose;
  t: number;
  width: number;
  height: number;
}> = ({ props, elements, businessPanels = [], cam, t, width, height }) => {
  const palette = useStage();
  const { fps } = useVideoConfig();
  assertModelBudget(props, businessPanels);
  const visible = visibleBoardProps(props, elements, cam, t, width, height);
  const rails: Record<string, BusinessModelRail> = {};
  for (const panel of businessPanels) {
    if (panel.modelRail) rails[panel.id] = panel.modelRail;
  }
  const businessVisible = visibleBusinessPanels(businessPanels, rails, cam, t, width, height);
  if (boardCanvasCount(visible) === 0 && businessVisible.length === 0) return null;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: BOARD_CAMERA_FOV, position: [0, 0, pixelCameraDistance(height)] }}
      flat
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <ExplainerProvider value={{ palette }}>
        <PixelCamera height={height} />
        <StudioEnvironment />
        <ambientLight intensity={0.36} />
        <hemisphereLight args={[palette.paper, palette.bgInner, 0.9]} />
        <directionalLight position={[-3.5, 6, 5]} intensity={2.2} />
        <directionalLight position={[5, 1.5, 3]} intensity={0.45} />
        <directionalLight position={[0, 3, -6]} intensity={0.5} color={palette.accent2} />
        {visible.map((entry) => {
          const { prop, pose } = entry;
          const s = worldToScreen(pose.world, cam, width, height);
          const def = HERO_PROP_DEFS[supportedModel(prop)];
          const unit = ((prop.size * cam.zoom) / MODEL_BOX) * def.framing.scale * pose.scale;
          return (
            <group
              key={prop.id}
              position={[s.x - width / 2, height / 2 - s.y, 0]}
              rotation={[0.08, (prop.yaw ?? def.yaw) + pose.spin, pose.roll]}
              scale={unit}
            >
              <group position={[0, def.framing.y, 0]}>
                <PropModel entry={entry} t={t} fps={fps} />
              </group>
            </group>
          );
        })}
        <BoardBusinessModels
          panels={businessPanels}
          rails={rails}
          camera={cam}
          seconds={t}
          width={width}
          height={height}
        />
      </ExplainerProvider>
    </ThreeCanvas>
  );
};

/** World-space soft contact shadows share the same culled, held poses as the models. */
export const BoardPropShadows: React.FC<{
  visible: readonly VisibleProp[];
  color: string;
  glowColor: string;
}> = ({ visible, color, glowColor }) => (
  <>
    {visible.map(({ prop, pose }) => {
      const w = prop.size * 0.72 * (1 + pose.lift * 0.5);
      const drop = prop.size * (0.42 + pose.lift * 0.35);
      const halo = prop.size * 3.2;
      return (
        <div key={prop.id}>
          {pose.glow > 0 && (
            <div
              style={{
                position: 'absolute',
                left: pose.world.x - halo / 2,
                top: pose.world.y - halo / 2,
                width: halo,
                height: halo,
                borderRadius: '50%',
                background: `radial-gradient(closest-side, ${glowColor}, transparent)`,
                opacity: pose.glow * 0.6,
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              left: pose.world.x - w / 2 + prop.size * 0.08,
              top: pose.world.y + drop - w * 0.11,
              width: w,
              height: w * 0.22,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${color}, transparent)`,
              opacity: pose.scale * (1 - pose.lift * 0.6),
              filter: `blur(${4 + pose.lift * 10}px)`,
            }}
          />
        </div>
      );
    })}
  </>
);
