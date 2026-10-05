import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RegionsDimensionsDiagram } from './regions-dimensions-Diagram';
import { RegionsDimensionsModels } from './regions-dimensions-models';
import { regionsDimensionsPose } from './regions-dimensions-poses';
import { cases, colors, composedHosts } from './regions-dimensions-test-fixtures';

for (const [index, scene] of cases().entries())
  it(`composed authored hosts including invisible meshes ${index}`, () => {
    for (const t of [0, 2, 4, 6, 8, 10, NaN]) {
      const hosts = composedHosts(
        createElement(RegionsDimensionsModels, {
          scene,
          pose: regionsDimensionsPose(scene, t),
          colors,
        }),
      );
      const count = hosts.filter((h) => h.type === 'mesh').length;
      expect(count).toBe(scene.storyId === '64' ? 1 : 'value' in scene.restriction ? 3 : 2);
      const ledger = { authored: count, studioMeshes: 8, studioInstances: 6, shadows: 2 };
      expect(Object.values(ledger).reduce((a, b) => a + b, 0)).toBe(
        scene.storyId === '64' ? 17 : 'value' in scene.restriction ? 19 : 18,
      );
      expect(count + 8 + 6 + 2).toBeLessThanOrEqual(19);
      expect(hosts.some((h) => h.type === 'sphereGeometry')).toBe(false);
      if (scene.storyId === '63' && !('value' in scene.overlap))
        expect(hosts.some((h) => h.type === 'torusGeometry')).toBe(false);
      expect(hosts.some((h) => h.type === 'canvas' || h.type === 'text')).toBe(false);
      for (const host of hosts) {
        if (Array.isArray(host.props.position))
          expect(host.props.position.every(Number.isFinite)).toBe(true);
        if (host.type.endsWith('Geometry'))
          expect((host.props.args as number[]).every(Number.isFinite)).toBe(true);
      }
    }
    const pose = regionsDimensionsPose(scene, 10);
    for (let page = 0; page < pose.pages.length; page++) {
      const svg = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(RegionsDimensionsDiagram, { scene, pose: { ...pose, page } }),
        ),
      );
      const tags = [...svg.matchAll(/<([a-z][\w]*)\b/g)].map((m) => m[1]);
      expect(tags.length).toBeLessThanOrEqual(61);
      expect(tags.filter((t) => t === 'text').length).toBeLessThanOrEqual(23);
      expect(tags).not.toContain('canvas');
      if (scene.storyId === '63') {
        expect(tags.filter((t) => t === 'circle').length).toBe('value' in scene.overlap ? 2 : 0);
        expect(svg).toContain('data-other-region="not-asserted"');
        expect(svg).not.toContain('data-membership="inside"');
        if (!('value' in scene.overlap)) expect(svg).toContain('data-no-chosen-relation="true"');
      } else {
        expect(tags.filter((t) => t === 'path').length).toBe(
          pose.exponent === 3 ? 12 : pose.exponent === 1 ? 1 : 0,
        );
        expect(svg).toContain(`Base × scale^${pose.exponent}`);
      }
    }
  });
