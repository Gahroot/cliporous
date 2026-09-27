/**
 * Flow scene (3D) — INPUT card → soft 3D engine cube → OUTPUT card.
 *
 * The input card types its text on `inputAt`, a small cube travels into the
 * engine, the engine does a quarter-turn "thinking" spin, then a cube travels
 * out and the output card types its text on `outputAt`.
 */

import { ThreeCanvas } from '@remotion/three';
import type React from 'react';
import { useMemo } from 'react';
import { interpolate } from 'remotion';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EASE } from '../../shared/easing';
import { ramp, STAGE, shade, usePop, useSceneTime } from './stage';
import { type CameraSpec, worldUnitsPerPixel } from './three-helpers';
import {
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  type FlowScene as FlowSceneData,
} from './types';

const CAMERA: CameraSpec = { position: [0, 0, 9], fov: 30 };
const CARD_W = 260;
const CARD_H = 180;
const CARD_CENTER_X = 340; // px from stage centre

/** Typewriter reveal: chars visible grow over 0.45s from `atSec`. */
function typed(text: string, t: number, atSec: number): string {
  const p = ramp(t, atSec, 0.45);
  return text.slice(0, Math.round(text.length * p));
}

const Card: React.FC<{
  side: -1 | 1;
  label: string;
  text: string;
  labelColor: string;
  enterDelay: number;
}> = ({ side, label, text, labelColor, enterDelay }) => {
  const { t } = useSceneTime();
  const enter = ramp(t, enterDelay, 0.5);
  return (
    <div
      style={{
        position: 'absolute',
        left: EXPLAINER_STAGE_WIDTH / 2 + side * CARD_CENTER_X - CARD_W / 2,
        top: EXPLAINER_STAGE_HEIGHT / 2 - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 18,
        background: STAGE.paper,
        boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
        padding: '26px 26px',
        opacity: enter,
        transform: `translateX(${(1 - enter) * side * 40}px) rotateY(${side * -8}deg)`,
      }}
    >
      <div
        style={{
          fontFamily: STAGE.font,
          fontWeight: 800,
          fontSize: 19,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: labelColor,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: STAGE.font,
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1.15,
          color: STAGE.paperText,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Engine: React.FC<{ scene: FlowSceneData; color: string }> = ({ scene, color }) => {
  const { t } = useSceneTime();
  const geometry = useMemo(() => new RoundedBoxGeometry(1.05, 1.05, 1.05, 6, 0.22), []);
  const smallGeometry = useMemo(() => new RoundedBoxGeometry(0.22, 0.22, 0.22, 3, 0.05), []);
  const pop = usePop(0.15, 140, 14);

  // Quarter-turn "thinking" spin between input and output.
  const spin = interpolate(t, [scene.inputAt + 0.3, scene.outputAt - 0.1], [0, Math.PI / 2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inOutQuart,
  });
  const idle = t * 0.25;
  const bob = Math.sin(t * 1.6) * 0.06;

  // Travelling particles (world x). Cards sit at ±CARD_CENTER_X px.
  const unit = worldUnitsPerPixel(CAMERA);
  const cardEdge = (CARD_CENTER_X - CARD_W / 2) * unit;
  const inP = ramp(t, scene.inputAt + 0.35, 0.5);
  const outP = ramp(t, Math.max(scene.inputAt + 0.9, scene.outputAt - 0.55), 0.5);
  const inX = -cardEdge + (cardEdge - 0.6) * inP;
  const outX = 0.6 + (cardEdge - 0.6) * outP;
  const showIn = inP > 0 && inP < 1;
  const showOut = outP > 0 && outP < 1;

  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#ffffff', '#1b2036', 0.9]} />
      <directionalLight position={[-3, 5, 6]} intensity={2.4} />
      <directionalLight position={[4, -2, 3]} intensity={0.4} />
      <mesh
        geometry={geometry}
        position={[0, bob, 0]}
        rotation={[0.45, 0.6 + idle + spin, 0.1]}
        scale={pop}
      >
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.02} />
      </mesh>
      {showIn && (
        <mesh geometry={smallGeometry} position={[inX, 0.05, 0.4]} rotation={[t * 3, t * 2, 0]}>
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      )}
      {showOut && (
        <mesh geometry={smallGeometry} position={[outX, 0.05, 0.4]} rotation={[t * 3, t * 2, 0]}>
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      )}
    </>
  );
};

export const FlowScene: React.FC<{ scene: FlowSceneData; accent: string }> = ({
  scene,
  accent,
}) => {
  const { t } = useSceneTime();
  const engineColor = shade(accent, 0.45);
  const pill = ramp(t, 0.35, 0.4);

  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 1400 }}>
      {/* Soft contact shadow under the engine */}
      <div
        style={{
          position: 'absolute',
          left: EXPLAINER_STAGE_WIDTH / 2 - 260,
          top: EXPLAINER_STAGE_HEIGHT / 2 + 120,
          width: 520,
          height: 70,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45), transparent 70%)',
        }}
      />
      <Card
        side={-1}
        label={scene.inputLabel}
        text={typed(scene.inputText, t, scene.inputAt)}
        labelColor={STAGE.muted}
        enterDelay={0}
      />
      <Card
        side={1}
        label={scene.outputLabel}
        text={typed(scene.outputText, t, scene.outputAt)}
        labelColor={accent}
        enterDelay={0.1}
      />
      <ThreeCanvas
        width={EXPLAINER_STAGE_WIDTH}
        height={EXPLAINER_STAGE_HEIGHT}
        camera={{ position: CAMERA.position, fov: CAMERA.fov }}
        flat
        gl={{ alpha: true, antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Engine scene={scene} color={engineColor} />
      </ThreeCanvas>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: EXPLAINER_STAGE_HEIGHT / 2 + 150,
          transform: `translateX(-50%) scale(${0.8 + pill * 0.2})`,
          opacity: pill,
          background: accent,
          color: '#ffffff',
          fontFamily: STAGE.font,
          fontWeight: 800,
          fontSize: 30,
          padding: '8px 24px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
        }}
      >
        {scene.engineLabel}
      </div>
    </div>
  );
};
