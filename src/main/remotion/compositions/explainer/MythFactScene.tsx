/**
 * Myth → fact scene (3D) — a thick rounded clay card floats in space. The
 * front shows a MYTH badge + the myth; on `flipAt` the card flips 180° on Y
 * with a spring (lifting toward the camera mid-flip, camera pushes in) and
 * lands on the FACT side with a soft burst.
 *
 * Text is painted into CanvasTextures on thin planes glued to each face, so it
 * turns with the card in true perspective and is hidden by back-face culling
 * when facing away. Textures are drawn at 2× the on-stage size (crisp at
 * 1080 px) once the web fonts are loaded (delayRender).
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { roundedRectGeometry } from './HeroProps';
import { Burst, Glow, useBreath, useReaction } from './motion';
import { mixHex, withAlpha } from './palette';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, type StageStyle, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import {
  EXPLAINER_STAGE_HEIGHT,
  EXPLAINER_STAGE_WIDTH,
  type MythFactScene as MythFactSceneData,
} from './types';

const CAMERA: CameraSpec = { position: [0, 0.9, 9.4], fov: 30 };
const CARD = { w: 3.9, h: 2.5, d: 0.3 } as const;
/** Texture pixels per world unit (≈2× the on-stage pixel density). */
const TEX_PX = 400;
/** Seconds after `flipAt` when the card lands on the fact side (sync: kinds-3d MYTH_FLIP_LAND_SEC). */
export const FLIP_LAND_SEC = 0.3;
const GROUND_Y = -1.75;

/** Delay the render until the canvas fonts are loaded; returns true when ready. */
function useCanvasFonts(): boolean {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Myth-fact card fonts'));
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      ["400 120px 'Instrument Serif'", "800 60px 'Inter'"].map((q) =>
        document.fonts.load(q).catch(() => undefined),
      ),
    )
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setReady(true);
        continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return ready;
}

/** Greedy word wrap for canvas text. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paint one face: badge (✕ MYTH / ✓ FACT) + serif statement, transparent elsewhere. */
function paintFace(S: StageStyle, kind: 'myth' | 'fact', text: string): HTMLCanvasElement {
  const W = Math.round(CARD.w * TEX_PX);
  const H = Math.round(CARD.h * TEX_PX);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const pad = 130;
  const badgeColor = kind === 'myth' ? S.negative : S.positive;

  // Badge pill with a drawn glyph (fonts may not carry ✕/✓).
  const badgeH = 104;
  ctx.font = `800 52px ${S.font}`;
  const word = kind === 'myth' ? 'MYTH' : 'FACT';
  const letter = 6;
  const wordW = ctx.measureText(word).width + letter * (word.length - 1);
  const badgeW = 44 + 44 + 22 + wordW + 46;
  const bx = pad;
  const by = pad - 10;
  roundRect(ctx, bx, by, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = badgeColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const gx = bx + 44 + 22;
  const gy = by + badgeH / 2;
  ctx.beginPath();
  if (kind === 'myth') {
    ctx.moveTo(gx - 15, gy - 15);
    ctx.lineTo(gx + 15, gy + 15);
    ctx.moveTo(gx + 15, gy - 15);
    ctx.lineTo(gx - 15, gy + 15);
  } else {
    ctx.moveTo(gx - 18, gy + 1);
    ctx.lineTo(gx - 5, gy + 14);
    ctx.lineTo(gx + 19, gy - 14);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  let x = gx + 22 + 22;
  for (const ch of word) {
    ctx.fillText(ch, x, gy + 3);
    x += ctx.measureText(ch).width + letter;
  }

  // Statement: largest serif size that fits in three lines, centred in the
  // space under the badge so short lines don't leave the lower card empty.
  const maxW = W - pad * 2;
  const areaTop = by + badgeH + 50;
  const areaBottom = H - pad + 10;
  const maxH = areaBottom - areaTop - 40;
  let size = 230;
  let lines: string[] = [];
  for (; size >= 80; size -= 6) {
    ctx.font = `400 ${size}px ${S.serif}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length <= 3 && lines.length * size * 1.04 <= maxH) break;
  }
  const lh = size * 1.04;
  const blockH = lines.length * lh + (kind === 'fact' ? 36 : 0);
  const top = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2) - size * 0.06;
  ctx.fillStyle = kind === 'myth' ? mixHex(S.paperText, S.paper, 0.22) : S.paperText;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => {
    ctx.fillText(l, pad, top + i * lh);
  });
  // Soft accent underline under the fact.
  if (kind === 'fact') {
    const last = lines[lines.length - 1] ?? '';
    const uw = Math.min(maxW, ctx.measureText(last).width);
    const uy = top + lines.length * lh + 14;
    roundRect(ctx, pad, uy, uw, 16, 8);
    ctx.fillStyle = withAlpha(S.accent, 0.6);
    ctx.fill();
  }
  return canvas;
}

function useFaceTexture(
  S: StageStyle,
  kind: 'myth' | 'fact',
  text: string,
  ready: boolean,
): CanvasTexture | null {
  return useMemo(() => {
    if (!ready) return null;
    const tex = new CanvasTexture(paintFace(S, kind, text));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [S, kind, text, ready]);
}

/** Flip progress: 0 = myth facing, 1 = fact facing (spring with a small overshoot). */
function useFlip(flipAt: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - Math.round(flipAt * fps),
    fps,
    config: { stiffness: 110, damping: 14, mass: 1 },
  });
}

const Card: React.FC<{ scene: MythFactSceneData; ready: boolean }> = ({ scene, ready }) => {
  const S = useStage();
  const { t, frame, fps } = useSceneTime();
  const geometry = useMemo(() => new RoundedBoxGeometry(CARD.w, CARD.h, CARD.d, 5, 0.16), []);
  const plate = useMemo(() => roundedRectGeometry(CARD.w - 0.3, CARD.h - 0.3, 0.12), []);
  const mythTex = useFaceTexture(S, 'myth', scene.myth, ready);
  const factTex = useFaceTexture(S, 'fact', scene.fact, ready);
  const enterAt = Math.max(0, scene.mythAt - 0.35);
  const enter = spring({
    frame: frame - Math.round(enterAt * fps),
    fps,
    config: { stiffness: 120, damping: 15, mass: 1 },
  });
  const textIn = ramp(t, scene.mythAt - 0.05, 0.45);
  const flip = useFlip(scene.flipAt);
  const reaction = useReaction(0);
  if (enter <= 0.001) return null;

  // Anticipation: a tiny counter-turn just before the flip.
  const pre = ramp(t, scene.flipAt - 0.22, 0.2) * (1 - Math.min(1, flip * 3));
  const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, flip)));
  const idleY = Math.sin(t * 1.1) * 0.07;
  const swayY = Math.sin(t * 0.7 + 0.6) * 0.07;
  const swayX = Math.sin(t * 0.55) * 0.035;
  const rotY = -0.18 * (1 - enter) + swayY - pre * 0.12 + flip * Math.PI;
  const y = (1 - enter) * -1.3 + idleY + arc * 0.22;
  const z = arc * 1.1;
  const scale = (0.85 + enter * 0.15) * reaction.scale;
  const cardColor = S.paper;
  const edgeColor = mixHex(S.paper, S.clay[1], 0.35);

  return (
    <group
      position={[0, y, z]}
      rotation={[-0.06 + swayX - arc * 0.08, rotY, (reaction.rotate * Math.PI) / 180]}
      scale={scale}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial color={edgeColor} roughness={0.55} metalness={0.02} />
      </mesh>
      {/* Face plates: slightly inset slabs in the card colour so the rim reads as a bevel. */}
      <mesh geometry={plate} position={[0, 0, CARD.d / 2 + 0.001]}>
        <meshStandardMaterial
          color={cardColor}
          roughness={0.6}
          metalness={0}
          emissive={cardColor}
          emissiveIntensity={0.14}
        />
      </mesh>
      <mesh geometry={plate} position={[0, 0, -CARD.d / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial
          color={cardColor}
          roughness={0.6}
          metalness={0}
          emissive={cardColor}
          emissiveIntensity={0.14}
        />
      </mesh>
      {mythTex && (
        <mesh position={[0, 0, CARD.d / 2 + 0.004]}>
          <planeGeometry args={[CARD.w, CARD.h]} />
          <meshStandardMaterial
            map={mythTex}
            transparent
            opacity={textIn}
            emissive="#ffffff"
            emissiveMap={mythTex}
            emissiveIntensity={0.14}
            roughness={0.6}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      )}
      {factTex && (
        <mesh position={[0, 0, -CARD.d / 2 - 0.004]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[CARD.w, CARD.h]} />
          <meshStandardMaterial
            map={factTex}
            transparent
            emissive="#ffffff"
            emissiveMap={factTex}
            emissiveIntensity={0.14}
            roughness={0.6}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

export const MythFactScene: React.FC<{ scene: MythFactSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const ready = useCanvasFonts();
  const rig = { focusAt: scene.flipAt + 0.15, driftDeg: 4, pushAmount: 0.1 };
  const camera = useRigCamera(CAMERA, rig);
  const breath = useBreath('myth-fact');
  const landAt = scene.flipAt + FLIP_LAND_SEC;
  const factOn = ramp(t, landAt - 0.1, 0.5);
  const center = projectToStage(camera, [0, 0, 0]);
  const reaction = useReaction(0);
  const glowColor = factOn > 0.5 ? S.positive : S.accent;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Halo behind the card: accent while it's a myth, positive once the fact lands. */}
      <div
        style={{
          position: 'absolute',
          left: center.x - 420,
          top: center.y - 300,
          width: 840,
          height: 600,
        }}
      >
        <Glow
          color={glowColor}
          intensity={
            (0.35 + breath * 0.25) * ramp(t, scene.mythAt, 0.6) +
            factOn * 0.35 +
            reaction.glow * 0.4
          }
          radius={300}
        />
      </div>
      {/* Burst behind the canvas so particles never speckle the card face. */}
      <Burst
        atSec={landAt}
        x={center.x}
        y={center.y}
        color={S.positive}
        radius={Math.min(EXPLAINER_STAGE_WIDTH, EXPLAINER_STAGE_HEIGHT) * 0.42}
        count={16}
        seed="myth-fact"
      />
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={8}>
        <Card scene={scene} ready={ready} />
      </Stage3D>
    </div>
  );
};
