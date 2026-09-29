/** Beveled icon objects: authored silhouettes, physical materials, seekable secondary motion. */
import type React from 'react';
import { useMemo } from 'react';
import { HERO_CATALOG } from '../hero-catalog';
import { Clay, type HeroPropDef, type HeroPropProps } from '../hero-kit';
import { followThrough, motionProgress, settleOffset, staggerDelay } from '../motion-tokens';
import { useSceneTime, useStage } from '../stage';
import { createIconShapes, type IconProp } from './icon-shapes';

const BODY_EXTRUSION = {
  depth: 0.24,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.045,
  bevelThickness: 0.045,
  curveSegments: 16,
};
const DETAIL_EXTRUSION = {
  ...BODY_EXTRUSION,
  depth: 0.035,
  bevelSize: 0.012,
  bevelThickness: 0.012,
  curveSegments: 12,
};

const IconObject: React.FC<HeroPropProps & { icon: IconProp }> = ({ icon, at, tone }) => {
  const S = useStage();
  const { frame, fps, t } = useSceneTime();
  const shapes = useMemo(() => {
    const authored = createIconShapes(icon);
    return {
      body: authored.body.map((shape, layer) => ({ shape, id: `${icon}:body:${layer}` })),
      detail: authored.detail.map((shape, layer) => ({ shape, id: `${icon}:detail:${layer}` })),
    };
  }, [icon]);
  const impact = at + HERO_CATALOG[icon].impactSec;
  const sample = (f: number): number => motionProgress(f, fps, impact - 0.22, 'snappy');
  const action = sample(frame);
  const lag = followThrough(sample, frame, fps, 0.07);
  const recoil = settleOffset(t - impact, 4, 7);
  const reverse = tone === 'down' ? -1 : 1;
  // Silhouettes remain identifiable at rest. Each accent describes the icon's meaning.
  const turn =
    icon === 'compass' ? (1 - lag) * Math.PI * 1.4 : icon === 'diamond' ? (1 - lag) * 0.8 : 0;
  const bodyY = icon === 'crown' || icon === 'graduation-cap' ? (1 - action) * 0.34 : 0;
  const bodyRotate =
    icon === 'lightning'
      ? recoil * 0.18
      : icon === 'checkmark'
        ? (1 - action) * -0.32
        : icon === 'warning'
          ? recoil * 0.1
          : 0;
  return (
    <group rotation={[0, icon === 'diamond' ? turn : 0, bodyRotate]} position={[0, bodyY, -0.12]}>
      {shapes.body.map(({ shape, id }) => (
        <mesh key={id}>
          <extrudeGeometry args={[shape, BODY_EXTRUSION]} />
          <Clay color={icon === 'warning' ? S.accent2 : S.clay[2]} />
        </mesh>
      ))}
      {shapes.detail.map(({ shape, id }, index) => {
        const reveal = motionProgress(
          frame,
          fps,
          impact - 0.22 + staggerDelay(index, shapes.detail.length, 0.05),
          'snappy',
        );
        const y =
          icon === 'cloud'
            ? (1 - reveal) * -0.45 * reverse
            : icon === 'chat'
              ? Math.sin(Math.min(1, reveal) * Math.PI) * 0.17
              : icon === 'link'
                ? (1 - reveal) * 0.55
                : 0;
        const x = icon === 'link' ? (1 - reveal) * 0.55 : 0;
        return (
          <group
            key={id}
            position={[x, y, 0.3]}
            rotation={[
              0,
              0,
              icon === 'compass' ? turn : icon === 'cloud' && tone === 'down' ? Math.PI : 0,
            ]}
            scale={Math.max(0.001, reveal)}
          >
            <mesh>
              <extrudeGeometry args={[shape, DETAIL_EXTRUSION]} />
              <Clay color={icon === 'diamond' ? S.accent2 : S.paper} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

function iconDef(icon: IconProp, yaw = -0.28): HeroPropDef {
  const Model: React.FC<HeroPropProps> = (props) => <IconObject {...props} icon={icon} />;
  return { Model, yaw, framing: { scale: 1.15, y: 0 } };
}

export const ICON_PROP_DEFS = {
  shield: iconDef('shield'),
  cloud: iconDef('cloud'),
  checkmark: iconDef('checkmark', -0.2),
  warning: iconDef('warning', -0.2),
  lightning: iconDef('lightning'),
  chat: iconDef('chat'),
  crown: iconDef('crown'),
  diamond: iconDef('diamond', -0.4),
  bookmark: iconDef('bookmark'),
  compass: iconDef('compass'),
  link: iconDef('link', -0.35),
  'graduation-cap': iconDef('graduation-cap'),
} satisfies Record<IconProp, HeroPropDef>;
