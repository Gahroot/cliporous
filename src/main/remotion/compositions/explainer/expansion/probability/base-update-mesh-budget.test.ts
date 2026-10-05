import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it, vi } from 'vitest';
import type { ExpansionSourceFixture } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionBaseRate,
  parseExpansionBayesUpdate,
} from '../../../../../ai/explainer/expansion-probability-base-update-contract';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { BaseUpdateModel, baseUpdateModelPlacement } from './base-update-models';
import { baseUpdatePose } from './base-update-poses';
import { ProbabilityBaseUpdateView } from './base-update-Scene';

const probe = vi.hoisted(() => ({ frame: 0 }));
vi.mock('remotion', async (original) => ({
  ...(await original<object>()),
  useCurrentFrame: () => probe.frame,
  useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
}));
// Explicit ownership-only marker: studio and ContactShadows costs below are source-owned,
// not mocked mesh instances, fabricated ThreeCanvas context or measured GPU memory.
vi.mock('../../Stage3D', () => ({
  Stage3D: ({ children }: { children: unknown }) =>
    createElement('stage-marker', null, children as never),
}));
const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/probability/base-update.source.json',
    'utf8',
  ),
) as { stories: ExpansionSourceFixture[] };
const count = (s: string, tag: string) =>
  [...s.matchAll(new RegExp(`<${tag}(?=[\\s/>])`, 'gi'))].length;
describe('base/update actual composed CPU geometry budget', () => {
  for (const raw of packet.stories)
    it(`${raw.id}: hidden/final meshes and SVGs are counted, not visible-only estimates`, () => {
      const ctx = makeParseContext(raw.words, raw.window);
      const scene =
        raw.id === '09'
          ? parseExpansionBaseRate(raw.proposal, ctx)
          : parseExpansionBayesUpdate(raw.proposal, ctx);
      expect(ctx.issues).toEqual([]);
      if (!scene) throw new Error('Real accepted parser scene required');
      for (const frame of [0, 120, 300]) {
        probe.frame = frame;
        const model = renderToStaticMarkup(
          createElement(BaseUpdateModel, {
            scene,
            pose: baseUpdatePose(frame / 30, scene),
            colors: { surface: '#fff', text: '#111', accent: '#999', muted: '#888' },
          }),
        );
        expect(count(model, 'mesh')).toBe(raw.id === '09' ? 105 : 110);
        expect(count(model, 'instancedMesh')).toBe(0);
        expect(count(model, 'text')).toBe(0);
        for (const visualMode of ['diagram', 'hybrid'] as const) {
          const html = renderToStaticMarkup(
            createElement(ProbabilityBaseUpdateView, { scene: { ...scene, visualMode } }),
          );
          expect(count(html, 'stage-marker')).toBe(visualMode === 'hybrid' ? 1 : 0);
          expect(count(html, 'svg')).toBe(2);
          expect(count(html, 'mesh')).toBe(visualMode === 'hybrid' ? count(model, 'mesh') : 0);
          expect(count(html, 'circle')).toBe(100);
          expect(count(html, 'rect')).toBe(raw.id === '09' ? 2 : 5);
          expect(count(html, 'path')).toBe(raw.id === '09' ? 1 : 7);
          expect(count(html, 'canvas')).toBe(0); // Marker intentionally does not claim native proof.
          const stageMeshes = visualMode === 'hybrid' ? 8 : 0;
          const stageInstances = visualMode === 'hybrid' ? 6 : 0;
          expect(count(html, 'mesh') + stageMeshes).toBe(
            visualMode === 'hybrid' ? (raw.id === '09' ? 113 : 118) : 0,
          );
          expect(stageInstances).toBe(visualMode === 'hybrid' ? 6 : 0);
        }
      }
    });
  it('keeps authored tray corners inside left model reservation with static front camera', () => {
    for (const [width, height] of [
      [1080, 960],
      [1320, 760],
    ]) {
      const p = baseUpdateModelPlacement(width, height);
      for (const x of [-2.8, 2.8])
        for (const y of [-2.8, 2.8]) {
          const px = width / 2 + ((p.x + x * p.scale) / 8.904573706) * height;
          const py = height / 2 - ((p.y + y * p.scale) / 8.904573706) * height;
          expect(px).toBeGreaterThanOrEqual(0);
          expect(px).toBeLessThan(width * 0.25);
          expect(py).toBeGreaterThanOrEqual(0);
          expect(py).toBeLessThan(height * 0.55);
        }
    }
  });
  it('pins separate shared-stage, shadow-display and shadow scratch source ownership', () => {
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    const studio = readFileSync(
      'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
      'utf8',
    );
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage).toContain('<StudioEnvironment');
    expect(stage).toContain('<ContactShadows');
    expect(studio).toContain('Environment');
    // Studio: 8 authored meshes / 6 instanced transforms. ContactShadows adds
    // 1 display mesh + 1 scratch blur mesh (not simultaneous scene instances).
    // These source-owned costs are separate from the actual SSR story meshes above.
    const room = new RoomEnvironment();
    let meshes = 0;
    let instances = 0;
    room.traverse((o) => {
      if (o instanceof Mesh) meshes++;
      if (o instanceof InstancedMesh) instances += o.count;
    });
    expect({ meshes, instances }).toEqual({ meshes: 8, instances: 6 });
    room.dispose();
    const shadow = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadow).toMatch(/new THREE\.Mesh\(/); // one offscreen scratch blur plane
    expect(shadow.match(/createElement\("mesh"/g)).toHaveLength(1); // one display plane
  });
});
