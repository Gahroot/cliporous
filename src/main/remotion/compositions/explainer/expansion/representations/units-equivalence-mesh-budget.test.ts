import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { UnitsEquivalenceDiagram } from './units-equivalence-Diagram';
import { UnitsEquivalenceModels } from './units-equivalence-models';
import {
  unitsEquivalenceConversionCards,
  unitsEquivalencePages,
  unitsEquivalencePose,
} from './units-equivalence-poses';
import { unitsEquivalenceCases } from './units-equivalence-test-fixtures';

const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
const tags = (s: string, name: string): number =>
  [...s.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;
describe('units/equivalence actual composed CPU mesh and SVG budgets, not native proof', () => {
  for (const [index, scene] of unitsEquivalenceCases().entries()) {
    it(`source case ${index}: counts every mounted host including opacity-zero geometry at every page and all five beats`, () => {
      const maxima = {
        conversionMeshes: 0,
        equivalenceMeshes: 0,
        conversionSvg: 0,
        equivalenceSvg: 0,
      };
      const pages = unitsEquivalencePages(scene);
      const times = [
        -1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        100,
        ...pages.map(
          (_, i) => scene.setupAt + ((i + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt),
        ),
      ];
      const visited = new Set<number>();
      for (const t of times) {
        const pose = unitsEquivalencePose(scene, t);
        visited.add(pose.page);
        const model = renderToStaticMarkup(
          createElement(UnitsEquivalenceModels, { scene, pose, colors }),
        );
        expect(model).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive|canvas|text)\b/);
        const meshes = tags(model, 'mesh');
        // Retained EvidenceDocumentClay mounts seven body meshes and two state bars per sheet.
        expect(meshes).toBe(scene.storyId === '49' ? 18 : 27);
        const diagrams = (['diagram', 'hybrid'] as const).map((visualMode) =>
          renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(UnitsEquivalenceDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          ),
        );
        expect(diagrams[0]).toBe(diagrams[1]);
        const svg = [...diagrams[0].matchAll(/<(?:svg|g|rect|circle|path|text)\b/g)].length;
        const expected =
          scene.storyId === '49'
            ? 12 +
              unitsEquivalenceConversionCards(scene, pose).reduce(
                (n, c) => n + c.lines.length * 2,
                0,
              ) +
              pages[pose.page].lines.length * 2
            : 6 +
              scene.views.reduce((n, v) => n + 3 + (v.marks ?? 1), 0) +
              pages[pose.page].lines.length * 2;
        expect(svg).toBe(expected);
        if (scene.storyId === '49') {
          maxima.conversionMeshes = Math.max(maxima.conversionMeshes, meshes);
          maxima.conversionSvg = Math.max(maxima.conversionSvg, svg);
        } else {
          maxima.equivalenceMeshes = Math.max(maxima.equivalenceMeshes, meshes);
          maxima.equivalenceSvg = Math.max(maxima.equivalenceSvg, svg);
        }
      }
      expect(visited.size).toBe(pages.length);
      expect(maxima.conversionMeshes).toBe(scene.storyId === '49' ? 18 : 0);
      expect(maxima.equivalenceMeshes).toBe(scene.storyId === '50' ? 27 : 0);
      expect(maxima.conversionSvg).toBeLessThanOrEqual(86);
      expect(maxima.equivalenceSvg).toBeLessThanOrEqual(140);
    });
  }
  it('pins golden maximum SVG hosts to the exact host equations proven at every source page above', () => {
    const maxima = { conversionSvg: 0, equivalenceSvg: 0 };
    for (const scene of unitsEquivalenceCases()) {
      const pages = unitsEquivalencePages(scene);
      for (let page = 0; page < pages.length; page++) {
        const time =
          scene.setupAt + ((page + 0.5) / pages.length) * (scene.resolveAt - scene.setupAt);
        const pose = unitsEquivalencePose(scene, time);
        const expected =
          scene.storyId === '49'
            ? 12 +
              unitsEquivalenceConversionCards(scene, pose).reduce(
                (n, card) => n + card.lines.length * 2,
                0,
              ) +
              pages[pose.page].lines.length * 2
            : 6 +
              scene.views.reduce((n, view) => n + 3 + (view.marks ?? 1), 0) +
              pages[pose.page].lines.length * 2;
        if (scene.storyId === '49') maxima.conversionSvg = Math.max(maxima.conversionSvg, expected);
        else maxima.equivalenceSvg = Math.max(maxima.equivalenceSvg, expected);
      }
    }
    expect(maxima).toEqual({ conversionSvg: 86, equivalenceSvg: 140 });
  });
  it('accounts separately for eight offline studio meshes/six instances and two shadow meshes', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((object) => {
      if ('isMesh' in object && object.isMesh) meshes++;
      if ('isInstancedMesh' in object && object.isInstancedMesh && 'count' in object)
        instances += Number(object.count);
    });
    room.dispose();
    expect({ meshes, instances }).toEqual({ meshes: 8, instances: 6 });
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b/);
    // Live plus scratch shadows: conversion 20, equivalence 29. Offline studio is separate.
  });
  it('pins zero-WebGL diagram/one hybrid stage ownership without fake renderer contexts', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/representations/units-equivalence-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).toContain('diagram={null}');
    expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<Stage3D\b|<ThreeCanvas\b|<canvas\b/);
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    for (const token of ['driftDeg={0}', 'pushAmount={0}', 'bobAmount={0}'])
      expect(hybrid).toContain(token);
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
  });
});
