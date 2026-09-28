/**
 * Hero scene (3D) — one soft clay prop (see HERO_PROP_DEFS) appears on the word that names it (spring scale + a slight
 * spin), then slowly turns and floats while the camera drifts. A label pill
 * sits under the prop; the prop's own impact beat (coin lands, lock clicks)
 * gets a soft burst and the camera push-in.
 */

import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { HERO_PROP_DEFS, HeroPropModel } from './HeroProps';
import { heroImpactSec } from './hero-catalog';
import {
  Burst,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import type { HeroScene as HeroSceneData } from './types';

const CAMERA: CameraSpec = { position: [0, 0.85, 8.8], fov: 30 };
const GROUND_Y = -1.38;

const Prop: React.FC<{ scene: HeroSceneData }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t } = useSceneTime();
  const pop = spring({
    frame: frame - Math.round(scene.at * fps),
    fps,
    config: { stiffness: 150, damping: 13, mass: 1 },
  });
  const reaction = useReaction(0);
  if (pop <= 0.001) return null;
  const since = Math.max(0, t - scene.at);
  const spinIn = (1 - Math.min(1, pop)) * -1.5;
  const turn = Math.sin(since * 0.5) * 0.3;
  const floatY = Math.sin(t * 1.15 + 0.4) * 0.07;
  const tilt = Math.sin(t * 0.8) * 0.035;
  const def = HERO_PROP_DEFS[scene.prop];
  const framing = def.framing;
  return (
    <group
      position={[0, framing.y + floatY + (1 - Math.min(1, pop)) * -0.4, 0]}
      rotation={[tilt, def.yaw + spinIn + turn, (reaction.rotate * Math.PI) / 180]}
      scale={pop * reaction.scale * framing.scale}
    >
      <HeroPropModel
        prop={scene.prop}
        at={scene.at}
        {...(scene.tone ? { tone: scene.tone } : {})}
      />
    </group>
  );
};

export const HeroScene: React.FC<{ scene: HeroSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const impactAt = scene.at + heroImpactSec(scene.prop, scene.tone);
  const rig = { focusAt: impactAt, driftDeg: 7, pushAmount: 0.09 };
  const camera = useRigCamera(CAMERA, rig);
  const breath = useBreath('hero');
  const reaction = useReaction(0);
  const float = useFloat('hero-label', 4);
  const shadow = useLivingShadow('hero-label', 0.8);
  const appear = ramp(t, scene.at, 0.6);
  const labelIn = ramp(t, scene.at + 0.3, 0.5);
  const center = projectToStage(camera, [0, 0.1, 0]);
  const labelAt = projectToStage(camera, [0, GROUND_Y - 0.2, 0.9]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: center.x - 380,
          top: center.y - 380,
          width: 760,
          height: 760,
        }}
      >
        <Glow
          color={S.accent}
          intensity={appear * (0.45 + breath * 0.3) + reaction.glow * 0.5}
          radius={360}
        />
      </div>
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={7}>
        <Prop scene={scene} />
      </Stage3D>
      <Burst
        atSec={impactAt}
        x={center.x}
        y={center.y}
        color={S.accent2}
        radius={300}
        count={14}
        seed="hero"
      />
      <div
        style={{
          position: 'absolute',
          left: labelAt.x,
          top: labelAt.y,
          transform: `translate(-50%, -50%) translateY(${(1 - labelIn) * 26}px) scale(${0.9 + labelIn * 0.1}) ${reactionTransform(reaction)}`,
          opacity: labelIn,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 34px 14px 26px',
            borderRadius: 999,
            background: S.cardRaised,
            border: `1.5px solid ${S.cardBorder}`,
            boxShadow: shadow,
            color: S.text,
            fontFamily: S.font,
            fontWeight: 700,
            fontSize: 40,
            whiteSpace: 'nowrap',
            transform: `translate(${float.x.toFixed(2)}px, ${float.y.toFixed(2)}px)`,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: S.accent,
              boxShadow: `0 0 ${10 + breath * 14}px ${S.accent}`,
            }}
          />
          {scene.label}
        </div>
      </div>
    </div>
  );
};
