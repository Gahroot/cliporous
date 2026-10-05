import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { hybridDiagramLayer } from '../../diagrams/HybridStage';
import { TaxonomyRightsDiagram } from './taxonomy-rights-Diagram';
import { TaxonomyRightsModels } from './taxonomy-rights-models';
import { taxonomyRightsPose } from './taxonomy-rights-poses';
import { taxonomyRightsTestScenes } from './taxonomy-rights-test-fixtures';

const scenes = taxonomyRightsTestScenes();
const colors = { surface: '#fff', text: '#111', accent: '#999', muted: '#555' };
function tags(markup: string, name: string): number {
  return [...markup.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;
}
describe('actual composed CPU model/SVG budgets, including mounted hidden geometry', () => {
  for (const [caseIndex, scene] of scenes.entries()) {
    it(`case ${caseIndex}: actual mesh/material tree at all beats, hidden setup and final hold`, () => {
      for (const t of [
        scene.setupAt - 1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        scene.resolveAt + 10,
      ]) {
        const markup = renderToStaticMarkup(
          createElement(TaxonomyRightsModels, {
            scene,
            pose: taxonomyRightsPose(scene, t),
            colors,
          }),
        );
        expect(markup).not.toMatch(/<(?:instancedMesh|skinnedMesh|primitive)\b|NaN|Infinity/);
        expect(tags(markup, 'mesh')).toBe(scene.entities.length * 3);
        expect(tags(markup, 'meshPhysicalMaterial')).toBe(scene.entities.length * 3);
      }
    });
    it(`case ${caseIndex}: actual composed SVG every page in both modes`, () => {
      const pages = taxonomyRightsPose(scene, scene.setupAt).pages;
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        let maximum = 0;
        for (let page = 0; page < pages.length; page++) {
          const t =
            page === pages.length - 1
              ? scene.resolveAt
              : scene.setupAt + ((page + 0.5) * (scene.resolveAt - scene.setupAt)) / pages.length;
          const pose = taxonomyRightsPose(scene, t);
          const markup = renderToStaticMarkup(
            createElement(
              DiagramSurface,
              null,
              createElement(TaxonomyRightsDiagram, {
                scene: { ...scene, visualMode },
                pose,
              }),
            ),
          );
          const svg = markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + 6);
          const elements = [...svg.matchAll(/<[a-zA-Z][\w-]*(?:\s|>)/g)].length;
          const selected =
            scene.storyId === '33'
              ? (scene.relations.find((r) => r.id === pages[page].id) ??
                (pages[page].id === 'resolve' ? scene.relations.at(-1) : scene.relations[0]))
              : undefined;
          const cross = selected && 'status' in selected && selected.status === 'excluded' ? 1 : 0;
          const exact =
            scene.storyId === '33'
              ? 12 + scene.entities.length * 5 + pose.pages[pose.page].lines.length * 2 + cross
              : 11 +
                scene.relations.length * 2 +
                scene.entities.length * 2 +
                pose.pages[pose.page].lines.length * 2;
          expect(elements).toBe(exact);
          maximum = Math.max(maximum, elements);
        }
        expect(maximum).toBeLessThanOrEqual(scene.storyId === '33' ? 79 : 85);
        if (caseIndex === 2) expect(maximum).toBe(79);
        if (caseIndex >= 3 && scene.storyId === '34') expect(maximum).toBe(85);
      }
    });
  }
  it('accounts separately for the real studio room: 8 meshes / 6 instances and two shadow meshes', () => {
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
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b|<instancedMesh\b|<primitive\b/);
    // Maximum live authored meshes 24 + displayed shadow 1; scratch shadow 1 is separate.
    // RoomEnvironment's 8 mesh objects / 6 light instances are one-time PMREM preparation.
  });
  it('uses zero canvas in diagram, one hybrid stage and one persistent planar surface', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/relationships/taxonomy-rights-Scene.tsx',
      'utf8',
    );
    expect(route).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return \(?\s*<DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(route).toContain('diagram={null}');
    expect(route).not.toMatch(/<ThreeCanvas\b|<Stage3D\b|<canvas\b/);
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(hybridDiagramLayer(null, 1)).toBeNull();
    expect(hybridDiagramLayer(undefined, 1)).toBeNull();
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
  });
});
