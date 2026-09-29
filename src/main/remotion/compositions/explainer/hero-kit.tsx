/**
 * Shared kit for procedural soft-clay 3D props (hero props + 3D scenes):
 * clay material, lathe/rounded-rect/extrude helpers and frame-exact springs.
 *
 * Rules every prop follows (see HeroProps.tsx for the reference props):
 *  - built from three.js primitives in the palette's clay tones (`useStage()`),
 *    no textures, no external models;
 *  - fits a ~2.4-unit box centred on the origin;
 *  - animates ONLY from the frame (`useSceneTime`, `ramp`, `useSpringAt`) —
 *    never clocks, `useFrame`, or drei helpers that tick on their own;
 *  - its signature impact happens `heroImpactSec(prop, tone)` after `at`
 *    (hero-catalog.ts) so the burst, camera push and sound line up.
 */

import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { LatheGeometry, Shape, ShapeGeometry, Vector2 } from 'three';
import type { HeroTone } from './types';

/** Props every hero prop model receives. `at` = appear beat (scene seconds). */
export interface HeroPropProps {
  at: number;
  tone?: HeroTone;
}

/** Per-prop resting pose + framing so every prop reads at a similar size. */
export interface HeroPropDef {
  Model: React.FC<HeroPropProps>;
  /** Resting yaw (radians): a flattering three-quarter view. */
  yaw: number;
  framing: { scale: number; y: number };
}

export function roundedRectShape(w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  const s = new Shape();
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

/** Flat rounded rectangle in the XY plane, centred, facing +Z. */
export function roundedRectGeometry(w: number, h: number, r: number): ShapeGeometry {
  return new ShapeGeometry(roundedRectShape(w, h, r), 6);
}

/** Lathe from [radius, y] points around the Y axis. */
export function lathe(points: readonly [number, number][], segments = 32): LatheGeometry {
  return new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    segments,
  );
}

/** Spring 0→1 starting at `atSec` (frame-exact). */
export function useSpringAt(atSec: number, stiffness: number, damping: number, mass = 1): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { stiffness, damping, mass },
  });
}

/** Damped wobble after `atSec` (0 before): sin decay, for landings/jolts. */
export function wobble(t: number, atSec: number, freq = 18, decay = 6): number {
  if (t < atSec) return 0;
  const k = t - atSec;
  return Math.exp(-k * decay) * Math.sin(k * freq);
}

export const Clay: React.FC<{
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}> = ({ color, roughness = 0.55, metalness = 0.02, emissive, emissiveIntensity = 0, opacity }) => (
  <meshPhysicalMaterial
    clearcoat={0.22}
    clearcoatRoughness={0.4}
    color={color}
    roughness={roughness}
    metalness={metalness}
    emissive={emissive ?? '#000000'}
    emissiveIntensity={emissiveIntensity}
    transparent={opacity !== undefined && opacity < 1}
    opacity={opacity ?? 1}
  />
);
