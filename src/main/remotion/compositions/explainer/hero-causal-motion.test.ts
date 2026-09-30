import { isValidElement } from 'react';
import { useCurrentFrame } from 'remotion';
import { describe, expect, it, vi } from 'vitest';
import { HeroPropActor } from './HeroScene';
import { isCausalHeroProp } from './hero-catalog';
import { useSceneTime } from './stage';
import { HERO_PROPS, type HeroProp } from './types';

vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: vi.fn(),
  useVideoConfig: () => ({ fps: 30 }),
}));
vi.mock('./stage', async (original) => ({
  ...(await original<typeof import('./stage')>()),
  useSceneTime: vi.fn(),
}));
vi.mock('./motion', async (original) => ({
  ...(await original<typeof import('./motion')>()),
  useReaction: () => ({ scale: 1, x: 0, rotate: 0, glow: 0 }),
}));

interface ActorTransform {
  position: readonly number[];
  rotation: readonly number[];
  scale: number;
}

function actorTransform(prop: HeroProp, seconds: number): ActorTransform {
  const frame = Math.round(seconds * 30);
  vi.mocked(useCurrentFrame).mockReturnValue(frame);
  vi.mocked(useSceneTime).mockReturnValue({ t: seconds, frame, fps: 30 });
  const tree = HeroPropActor({ scene: { kind: 'hero', prop, label: 'Authored action', at: 0 } });
  if (!isValidElement<ActorTransform>(tree)) throw new Error('Missing hero actor');
  return { position: tree.props.position, rotation: tree.props.rotation, scale: tree.props.scale };
}

const causal = HERO_PROPS.filter(isCausalHeroProp);

describe('bounded motion is not undone by the shared hero wrapper', () => {
  it('classifies all 28 new props without changing the 43 legacy props', () => {
    expect(causal).toHaveLength(28);
    expect(HERO_PROPS.filter((prop) => !isCausalHeroProp(prop))).toHaveLength(43);
  });

  it.each(causal)('%s has a stable parent pose after its authored action', (prop) => {
    expect(actorTransform(prop, 4)).toEqual(actorTransform(prop, 5));
  });

  it('preserves the legacy coin turn and float', () => {
    expect(actorTransform('coins', 4)).not.toEqual(actorTransform('coins', 5));
  });
});
