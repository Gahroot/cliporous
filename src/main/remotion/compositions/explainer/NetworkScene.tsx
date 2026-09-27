/**
 * Network scene — nodes (icon circles + labels) pop in around a ring; a line
 * draws from the hub (or the previous node when there is no hub) to each one on
 * its beat. At `connectAllAt` every node links to every other: lines draw in
 * quickly and a glowing pulse dot runs along each new link.
 *
 * Motion adapted from Remocn ecosystem-constellation (MIT): ring geometry,
 * pulsing centre glow, accent spokes with per-satellite springs.
 */

import type React from 'react';
import { resolveIcon } from '../blocks/icon';
import {
  Burst,
  EASE_IN_OUT_SOFT,
  Glow,
  hash01,
  reactionTransform,
  useBreath,
  useFloat,
  useLivingShadow,
  useReaction,
} from './motion';
import { mixHex, withAlpha } from './palette';
import { ramp, usePop, useSceneTime, useStage } from './stage';
import type { NetworkScene as NetworkSceneData } from './types';

type NetNode = NetworkSceneData['nodes'][number];

const CX = 540;
const CY = 470;
const NODE_D = 118;
const HUB_D = 176;

interface Pt {
  x: number;
  y: number;
}

/** Same drift as `useFloat(seed, amp)` — pure, so line endpoints can follow the nodes. */
function driftAt(t: number, seed: string, amp: number, periodSec = 4.6): Pt {
  const phase = hash01(seed) * Math.PI * 2;
  const w = (Math.PI * 2) / periodSec;
  return {
    x: Math.sin(t * w * 0.7 + phase * 1.3) * amp * 0.45,
    y: Math.sin(t * w + phase) * amp,
  };
}

/** Segment a→b trimmed by `ra` at the start and `rb` at the end. */
function trim(a: Pt, b: Pt, ra: number, rb: number): { a: Pt; b: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  return {
    a: { x: a.x + ux * ra, y: a.y + uy * ra },
    b: { x: b.x - ux * rb, y: b.y - uy * rb },
  };
}

const NetworkNode: React.FC<{
  node: NetNode;
  index: number;
  pos: Pt;
  focus: number;
  labelAbove: boolean;
}> = ({ node, index, pos, focus, labelAbove }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const pop = usePop(node.at, 200, 13);
  const reaction = useReaction(index);
  // Positional drift comes from the parent (driftAt, same seed) so lines follow;
  // the hook adds the matching gentle tilt.
  const float = useFloat(`net-node-${index}`, 5);
  const shadow = useLivingShadow(`net-node-${index}`, 0.9);
  const Icon = resolveIcon(node.icon);
  if (pop <= 0.001) return null;
  const glow = Math.max(focus, reaction.glow);
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x - 170,
        top: labelAbove ? pos.y - NODE_D / 2 - 64 : pos.y - NODE_D / 2,
        width: 340,
        display: 'flex',
        flexDirection: labelAbove ? 'column-reverse' : 'column',
        alignItems: 'center',
        opacity: Math.min(1, pop * 1.6),
        transformOrigin: `170px ${labelAbove ? NODE_D / 2 + 64 : NODE_D / 2}px`,
        transform: `scale(${(0.4 + 0.6 * pop).toFixed(4)}) rotate(${float.rotate.toFixed(3)}deg) ${reactionTransform(reaction)}`,
      }}
    >
      <div style={{ position: 'relative', width: NODE_D, height: NODE_D }}>
        <Glow color={S.accentSoft} intensity={glow} radius={110} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 28%, ${mixHex(S.cardRaised, S.text, 0.1)} 0%, ${S.cardRaised} 55%, ${S.card} 100%)`,
            border: `2px solid ${glow > 0.05 ? withAlpha(S.accent, 0.35 + 0.55 * Math.min(1, glow)) : S.cardBorder}`,
            boxShadow: `${shadow}, inset 0 2px 0 ${withAlpha(S.text, 0.1)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={52} strokeWidth={1.9} color={S.accent} />
        </div>
      </div>
      <div
        style={{
          margin: labelAbove ? '0 0 12px' : '14px 0 0',
          padding: '6px 16px',
          borderRadius: 999,
          background: withAlpha(S.bgOuter, 0.85),
          fontFamily: S.font,
          fontWeight: 700,
          fontSize: 32,
          color: S.text,
          whiteSpace: 'nowrap',
          opacity: ramp(t, node.at + 0.08, 0.35),
          transform: `translateY(${((1 - ramp(t, node.at + 0.08, 0.4)) * 10).toFixed(2)}px)`,
        }}
      >
        {node.label}
      </div>
    </div>
  );
};

const Hub: React.FC<{ label: string; at: number; pos: Pt }> = ({ label, at, pos }) => {
  const S = useStage();
  const pop = usePop(at, 180, 13);
  const breath = useBreath('net-hub');
  const reaction = useReaction(undefined);
  if (pop <= 0.001) return null;
  const size = HUB_D * (1 + breath * 0.03);
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x - size / 2,
        top: pos.y - size / 2,
        width: size,
        height: size,
        opacity: Math.min(1, pop * 1.6),
        transform: `scale(${(0.5 + 0.5 * pop).toFixed(4)}) ${reactionTransform(reaction)}`,
      }}
    >
      <Glow color={S.accentSoft} intensity={0.55 + 0.35 * breath + reaction.glow} radius={200} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 28%, ${mixHex(S.accent, '#ffffff', 0.25)} 0%, ${S.accent} 55%, ${mixHex(S.accent, '#000000', 0.25)} 100%)`,
          boxShadow: `0 0 ${Math.round(50 + breath * 30)}px ${withAlpha(S.accent, 0.45)}, 0 24px 50px rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.35)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 16,
          fontFamily: S.font,
          fontWeight: 800,
          fontSize: label.length > 7 ? 30 : 38,
          lineHeight: 1.05,
          color: '#ffffff',
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const NetworkScene: React.FC<{ scene: NetworkSceneData }> = ({ scene }) => {
  const S = useStage();
  const { t } = useSceneTime();
  const nodes = scene.nodes;
  const n = nodes.length;
  const hasHub = !!scene.hub;
  const firstAt = n > 0 ? Math.min(...nodes.map((d) => d.at)) : 0.2;
  const hubAt = Math.max(0.05, firstAt - 0.4);

  const rx = n <= 3 ? 330 : 360;
  const ry = n <= 3 ? 270 : 290;
  const hd = driftAt(t, 'net-hub', 4);
  const hubPos: Pt = { x: CX + hd.x, y: CY + hd.y };
  const angleOf = (i: number): number => -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
  const positions: Pt[] = nodes.map((_, i) => {
    const a = angleOf(i);
    const d = driftAt(t, `net-node-${i}`, 5);
    return { x: CX + Math.cos(a) * rx + d.x, y: CY + Math.sin(a) * ry + d.y };
  });

  // Base links: hub spokes, or a chain from the previous node.
  const base: { from: Pt; to: Pt; rf: number; at: number; key: string }[] = [];
  nodes.forEach((node, i) => {
    if (hasHub)
      base.push({ from: hubPos, to: positions[i], rf: HUB_D / 2, at: node.at, key: `h${i}` });
    else if (i > 0)
      base.push({
        from: positions[i - 1],
        to: positions[i],
        rf: NODE_D / 2 + 6,
        at: node.at,
        key: `c${i}`,
      });
  });

  // Full mesh at connectAllAt: every pair not already linked.
  const mesh: { a: number; b: number; at: number }[] = [];
  if (scene.connectAllAt !== undefined) {
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!hasHub && j === i + 1) continue;
        mesh.push({ a: i, b: j, at: scene.connectAllAt + k * 0.06 });
        k++;
      }
    }
  }
  const meshGlow =
    scene.connectAllAt !== undefined && t >= scene.connectAllAt
      ? ramp(t, scene.connectAllAt, 0.6)
      : 0;

  const nodeR = NODE_D / 2 + 6;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg
        width={1080}
        height={960}
        viewBox="0 0 1080 960"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        aria-hidden="true"
      >
        {mesh.map((m) => {
          const p = ramp(t, m.at, 0.3);
          if (p <= 0) return null;
          const s = trim(positions[m.a], positions[m.b], nodeR, nodeR);
          return (
            <line
              key={`m${m.a}-${m.b}`}
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - p}
              stroke={mixHex(S.accent, S.text, 0.25)}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.5}
            />
          );
        })}
        {base.map((l) => {
          const p = ramp(t, l.at - 0.05, 0.5);
          if (p <= 0) return null;
          const s = trim(l.from, l.to, l.rf + 4, nodeR);
          return (
            <line
              key={l.key}
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - p}
              stroke={S.accent}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.75 + 0.2 * meshGlow}
            />
          );
        })}
        {mesh.map((m) => {
          const local = (t - m.at - 0.1) / 0.8;
          if (local <= 0 || local >= 1) return null;
          const s = trim(positions[m.a], positions[m.b], nodeR, nodeR);
          const e = EASE_IN_OUT_SOFT(local);
          const x = s.a.x + (s.b.x - s.a.x) * e;
          const y = s.a.y + (s.b.y - s.a.y) * e;
          const fade = Math.min(1, local * 6, (1 - local) * 5);
          return (
            <g key={`d${m.a}-${m.b}`} opacity={fade}>
              <circle cx={x} cy={y} r={16} fill={S.accent} opacity={0.22} />
              <circle cx={x} cy={y} r={9} fill={S.accent} opacity={0.55} />
              <circle cx={x} cy={y} r={5} fill="#ffffff" />
            </g>
          );
        })}
      </svg>
      {scene.hub && <Hub label={scene.hub} at={hubAt} pos={hubPos} />}
      {nodes.map((node, i) => {
        const since = t - node.at;
        const recent = since >= 0 && since < 1.2 ? 1 - since / 1.2 : 0;
        return (
          <NetworkNode
            key={`${node.at}-${node.label}`}
            node={node}
            index={i}
            pos={positions[i]}
            focus={Math.max(recent, meshGlow * 0.35)}
            labelAbove={Math.sin(angleOf(i)) < -0.6}
          />
        );
      })}
      {scene.connectAllAt !== undefined && (
        <Burst
          atSec={scene.connectAllAt}
          x={hubPos.x}
          y={hubPos.y}
          color={S.accent}
          radius={220}
          seed="net-connect"
        />
      )}
    </div>
  );
};
