/**
 * Podium scene (3D) — three rounded clay blocks: 1st in the centre (tallest),
 * 2nd on the left, 3rd on the right, each with a big rank number painted on
 * its front face (canvas texture → turns with the block in true perspective).
 *
 *  - a place's block rises out of the ground over PODIUM_RISE_SEC from its
 *    `at` (ease-out with a small settle), then its label pill drops onto the
 *    top face (tracked with `projectToStage`);
 *  - 1st place turns accent and gets a Burst, halo and the camera push-in
 *    when its block tops out;
 *  - ranks not in `places` stay as a low, dim stub so the podium still reads.
 *
 * Reactions: places in array order.
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender, Easing } from 'remotion';
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Clay } from './hero-kit';
import {
  Burst,
  Glow,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex } from './palette';
import { Stage3D, useRigCamera } from './Stage3D';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import { type CameraSpec, projectToStage } from './three-helpers';
import type { PodiumScene as PodiumSceneData } from './types';

type PodiumPlace = PodiumSceneData['places'][number];

/** Same timing as PODIUM_RISE_SEC in src/main/ai/explainer/kinds-3d-objects.ts (block tops out → cue). */
const PODIUM_RISE_SEC = 0.45;

const CAMERA: CameraSpec = { position: [0, 2.3, 10.6], fov: 30 };
const GROUND_Y = -1.75;
const BLOCK_W = 1.62;
const BLOCK_D = 1.3;
const GAP = 0.1;
/** Full heights per rank (1st tallest). */
const HEIGHT: Record<1 | 2 | 3, number> = { 1: 2.35, 2: 1.65, 3: 1.15 };
const X: Record<1 | 2 | 3, number> = { 1: 0, 2: -(BLOCK_W + GAP), 3: BLOCK_W + GAP };
/** Height of a rank that is not in the scene. */
const STUB_H = 0.22;
const TEX = 256;

type Rank = 1 | 2 | 3;

function useCanvasFont(): boolean {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Podium rank font'));
  useEffect(() => {
    let cancelled = false;
    document.fonts
      .load("800 200px 'Inter'")
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

function useRankTexture(rank: Rank, font: string, ready: boolean): CanvasTexture | null {
  const tex = useMemo(() => {
    if (!ready) return null;
    const canvas = document.createElement('canvas');
    canvas.width = TEX;
    canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(TEX * 0.78)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(rank), TEX / 2, TEX * 0.54);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [rank, font, ready]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** Current block height for a rank (pure function of t). */
function blockHeight(place: PodiumPlace | undefined, rank: Rank, t: number): number {
  const full = HEIGHT[rank];
  if (!place) return STUB_H;
  const u = Math.min(1, Math.max(0, (t - place.at) / PODIUM_RISE_SEC));
  const rise = Easing.bezier(0.2, 0.9, 0.3, 1)(u);
  // Tiny settle bump after topping out.
  const k = t - (place.at + PODIUM_RISE_SEC);
  const settle = k > 0 ? 0.05 * Math.exp(-k * 7) * Math.sin(k * 16) : 0;
  return Math.max(0.02, STUB_H * 0.5 + (full - STUB_H * 0.5) * rise + settle * full);
}

const Block: React.FC<{
  rank: Rank;
  place: PodiumPlace | undefined;
  index: number;
  ready: boolean;
}> = ({ rank, place, index, ready }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const reaction = useReaction(index);
  const breath = useBreath(`podium${rank}`);
  // Unit box scaled in y would stretch the rounded corners: rebuild per height bucket instead.
  const h = blockHeight(place, rank, t);
  const hq = Math.round(h * 50) / 50;
  const geom = useMemo(() => new RoundedBoxGeometry(BLOCK_W, hq, BLOCK_D, 4, 0.1), [hq]);
  useEffect(() => () => geom.dispose(), [geom]);
  const tex = useRankTexture(rank, S.font, ready);
  const topped = place ? ramp(t, place.at + PODIUM_RISE_SEC * 0.7, 0.4) : 0;
  const first = rank === 1 && place !== undefined;
  const base = rank === 1 ? S.clay[0] : rank === 2 ? S.clay[1] : S.clay[2];
  const color = place
    ? first
      ? mixHex(base, S.accent, 0.8 * topped)
      : base
    : mixHex(base, S.bgInner, 0.55);
  const glow = first ? topped * (0.18 + breath * 0.14) : 0;
  const numberIn = place ? ramp(t, place.at + 0.1, 0.45) : 0;
  const numSize = Math.min(BLOCK_W * 0.62, hq * 0.62);
  const numY = Math.min(hq / 2 - numSize * 0.55 - 0.12, 0);
  return (
    <group position={[X[rank], GROUND_Y + hq / 2, 0]} scale={[reaction.scale, 1, reaction.scale]}>
      <mesh geometry={geom}>
        <Clay color={color} emissive={S.accent} emissiveIntensity={glow + reaction.glow * 0.25} />
      </mesh>
      {tex && numberIn > 0.01 && hq > numSize * 0.8 && (
        <mesh position={[0, numY, BLOCK_D / 2 + 0.004]}>
          <planeGeometry args={[numSize, numSize]} />
          <meshStandardMaterial
            map={tex}
            color={first ? '#ffffff' : mixHex(S.paper, base, 0.15)}
            transparent
            opacity={numberIn * 0.92}
            emissive="#ffffff"
            emissiveMap={tex}
            emissiveIntensity={first ? 0.35 : 0.15}
            roughness={0.6}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

const PlaceLabel: React.FC<{
  place: PodiumPlace;
  index: number;
  x: number;
  y: number;
}> = ({ place, index, x, y }) => {
  const S = useStage();
  const landAt = place.at + PODIUM_RISE_SEC;
  const pop = usePop(landAt - 0.05, 230, 13);
  const reaction = useReaction(index);
  const float = useFloat(`podium-label${index}`, 3);
  const shadow = useLivingShadow(`podium-label${index}`, 0.8);
  if (pop <= 0.001) return null;
  const first = place.rank === 1;
  const drop = (1 - Math.min(1, pop)) * -70;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -100%) translate(${float.x.toFixed(2)}px, ${(drop + float.y).toFixed(2)}px) scale(${(0.7 + 0.3 * pop).toFixed(4)}) ${reactionTransform(reaction)}`,
        transformOrigin: 'center bottom',
        opacity: Math.min(1, pop * 1.6),
      }}
    >
      {first && <Glow color={S.accent} intensity={0.55 + reaction.glow * 0.4} radius={110} />}
      <div
        style={{
          position: 'relative',
          padding: first ? '12px 30px' : '10px 24px',
          borderRadius: 999,
          background: first ? S.accent : S.cardRaised,
          border: first ? 'none' : `1.5px solid ${S.cardBorder}`,
          color: first ? '#ffffff' : S.text,
          fontFamily: S.font,
          fontWeight: first ? 800 : 700,
          fontSize: first ? 40 : 34,
          whiteSpace: 'nowrap',
          maxWidth: first ? 420 : 330,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: shadow,
        }}
      >
        {place.label}
      </div>
    </div>
  );
};

export const PodiumScene: React.FC<{ scene: PodiumSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const ready = useCanvasFont();
  const byRank = (r: Rank): PodiumPlace | undefined => scene.places.find((p) => p.rank === r);
  const firstPlace = byRank(1);
  const firstLand = firstPlace ? firstPlace.at + PODIUM_RISE_SEC : undefined;
  const lastAt = Math.max(...scene.places.map((p) => p.at), 0);
  const rig = { focusAt: firstLand ?? lastAt + PODIUM_RISE_SEC, driftDeg: 5, pushAmount: 0.07 };
  const camera = useRigCamera(CAMERA, rig);
  const breath = useBreath('podium');
  const firstTop = projectToStage(camera, [0, GROUND_Y + HEIGHT[1], BLOCK_D * 0.15]);
  const halo = firstLand !== undefined ? ramp(t, firstLand - 0.1, 0.6) : 0;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: firstTop.x - 360,
          top: firstTop.y - 200,
          width: 720,
          height: 640,
        }}
      >
        <Glow color={S.accent} intensity={halo * (0.45 + breath * 0.3)} radius={320} />
      </div>
      {firstLand !== undefined && (
        <Burst
          atSec={firstLand}
          x={firstTop.x}
          y={firstTop.y - 40}
          color={S.accent}
          radius={320}
          count={16}
          seed="podium"
        />
      )}
      <Stage3D camera={CAMERA} {...rig} groundY={GROUND_Y} shadowScale={9}>
        {([1, 2, 3] as const).map((rank) => {
          const place = byRank(rank);
          const index = place ? scene.places.indexOf(place) : -1;
          return <Block key={rank} rank={rank} place={place} index={index} ready={ready} />;
        })}
      </Stage3D>
      {scene.places.map((place, i) => {
        const rank: Rank = place.rank === 2 ? 2 : place.rank === 3 ? 3 : 1;
        const h = blockHeight(place, rank, t);
        const top = projectToStage(camera, [X[rank], GROUND_Y + h, BLOCK_D * 0.1]);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: places are positional
          <PlaceLabel key={i} place={place} index={i} x={top.x} y={top.y - 10} />
        );
      })}
    </div>
  );
};
