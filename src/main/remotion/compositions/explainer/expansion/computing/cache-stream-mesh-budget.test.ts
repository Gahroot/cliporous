import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { afterAll, describe, expect, it } from 'vitest';
import { ExplainerProvider } from '../../stage';
import { CacheStreamDiagram } from './cache-stream-Diagram';
import { CacheStreamModels } from './cache-stream-models';
import { cacheStreamPose } from './cache-stream-poses';
import { cacheStreamCases } from './cache-stream-test-fixtures';

describe('actual cache/stream authored host budget (not GPU)', () => {
  let maxSvg = 0,
    maxPages = 0;
  afterAll(() => {
    expect(maxSvg).toBe(59);
    expect(maxPages).toBe(45);
  });
  for (const [index, scene] of cacheStreamCases().entries())
    it(`composed source ${index}`, () => {
      const room = new RoomEnvironment();
      let studio = 0,
        instances = 0;
      room.traverse((o) => {
        if (o instanceof Mesh) studio++;
        if (o instanceof InstancedMesh) instances += o.count;
      });
      expect([studio, instances]).toEqual([8, 6]);
      room.dispose();
      const shadow = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
      expect(shadow.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
      expect(shadow.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
      const base = cacheStreamPose(scene, scene.setupAt);
      maxPages = Math.max(maxPages, base.pages.length);
      for (let page = 0; page < base.pages.length; page++) {
        const pose = { ...base, page };
        const model = renderToStaticMarkup(
          createElement(
            ExplainerProvider,
            {
              value: {},
            },
            createElement(CacheStreamModels, {
              scene,
              pose,
              colors: { surface: '#fff', text: '#000', accent: '#555', muted: '#888' },
            }),
          ),
        );
        expect([...model.matchAll(/<mesh\b/g)]).toHaveLength(9);
        expect([...model.matchAll(/<mesh\b/g)].length + studio + 2).toBe(19);
        const svg = renderToStaticMarkup(createElement(CacheStreamDiagram, { scene, pose }));
        const svgHosts = [...svg.matchAll(/<(?:g|rect|path|text)\b/g)].length;
        maxSvg = Math.max(maxSvg, svgHosts);
        expect(svgHosts).toBeLessThanOrEqual(59);
        expect(model + svg).not.toMatch(/NaN|Infinity/);
      }
    });
});
