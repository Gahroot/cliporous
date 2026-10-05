import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RegionsDimensionsDiagram } from './regions-dimensions-Diagram';
import { regionsDimensionsPose } from './regions-dimensions-poses';
import { accepted, interBounds, maximumDimension } from './regions-dimensions-test-fixtures';

it('keeps a real accepted coprime exact result fully inside the authored planar surface', () => {
  const scene = accepted(maximumDimension('line-length', 'known', '99991/99989', '9973/9967'));
  expect(scene.storyId).toBe('64');
  if (scene.storyId !== '64') throw new Error('Wrong accepted fixture');
  expect(scene.result.state).toBe('derived');
  const pose = regionsDimensionsPose(scene, scene.resolveAt);
  const markup = renderToStaticMarkup(
    createElement('svg', null, createElement(RegionsDimensionsDiagram, { scene, pose })),
  );
  for (const node of markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const x = Number(/\bx="([^"]*)"/.exec(node[1])?.[1]);
    const y = Number(/\by="([^"]*)"/.exec(node[1])?.[1]);
    const bounds = interBounds(node[2]);
    expect(x + bounds[0], node[2]).toBeGreaterThanOrEqual(0);
    expect(x + bounds[2], node[2]).toBeLessThanOrEqual(952);
    expect(y + bounds[1], node[2]).toBeGreaterThanOrEqual(0);
    expect(y + bounds[3], node[2]).toBeLessThanOrEqual(478);
  }
});
