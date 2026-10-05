import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { hybridDiagramLayer } from '../../diagrams/HybridStage';
import { PriorityTreeDiagram, PriorityTreeFacts } from './priority-tree-Diagram';
import { PriorityTreeModels } from './priority-tree-models';
import {
  priorityTreeAnchors,
  priorityTreeLines,
  priorityTreePages,
  priorityTreePose,
} from './priority-tree-poses';
import {
  parsePriorityTree,
  priorityTreeColors,
  priorityTreeFixtures,
} from './priority-tree-test-fixtures';
import type { ExpansionPriorityTreeScene } from './priority-tree-types';

const count = (markup: string, name: string) =>
  [...markup.matchAll(new RegExp(`<${name}\\b`, 'g'))].length;
const textHosts = (text: string, columns = 36) => 1 + priorityTreeLines(text, columns).length;
function svgLedger(scene: ExpansionPriorityTreeScene, t: number): number {
  const page = priorityTreePages(scene)[priorityTreePose(scene, t).page];
  let result = 1 + 1 + 1 + 1 + 1; // SVG, diagram root, facts root, facts rect, current-page group.
  result += textHosts(page.title) + textHosts(page.context) + textHosts(page.text);
  if (scene.storyId === '27') {
    const names = scene.priorities ? ['Before', 'After'] : ['Source criteria · supplied weights'];
    for (const name of names) {
      result += 1 + textHosts(name); // rail group and heading
      for (const c of scene.criteria) {
        const label = scene.entities.find((e) => e.id === c.entityId)?.label;
        if (!label) throw new Error('Lost criterion identity');
        result += 2 + textHosts(label, 16); // identity group and rect
      }
    }
  } else result += scene.branches.length * 3 + scene.nodes.length * 4; // each edge group/two paths, node group/shape/text/tspan
  return result;
}
function modelLedger(scene: ExpansionPriorityTreeScene, t: number): number {
  if (scene.storyId === '27')
    return (
      priorityTreeAnchors(scene).length * 3 +
      scene.candidateIds.reduce(
        (sum, id) =>
          sum +
          (scene.resolution.state === 'source-chosen' &&
          scene.resolution.choiceId === id &&
          priorityTreePose(scene, t).resolve > 0
            ? 3
            : 4),
        0,
      )
    );
  return (
    scene.nodes.reduce(
      (sum, node) =>
        sum +
        5 +
        (node.role === 'condition'
          ? 5
          : node.state === 'known' || node.state === 'disputed'
            ? 2
            : 5),
      0,
    ) + scene.branches.length
  );
}

describe('priority/tree real composed React SSR costs — no Canvas context, not native/GPU', () => {
  it('counts mounted meshes including hidden setup geometry and current-only SVG; pins attained ceilings', () => {
    const maxima = { priorityMeshes: 0, treeMeshes: 0, prioritySvg: 0, treeSvg: 0, pages: 0 };
    for (const fixture of priorityTreeFixtures())
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const scene = parsePriorityTree(fixture, visualMode),
          pages = priorityTreePages(scene);
        maxima.pages = Math.max(maxima.pages, pages.length);
        const pageTimes = pages.map((_, i) =>
          i === pages.length - 1
            ? scene.resolveAt + 0.25
            : scene.actionAt +
              ((i + 0.5) / (pages.length - 1)) * (scene.resolveAt - scene.actionAt),
        );
        // Every page and every five-beat state, including pre-reveal and nonfinite fail-closed probes.
        const times = [
          -1,
          NaN,
          Infinity,
          -Infinity,
          scene.setupAt,
          scene.actionAt,
          scene.responseAt,
          scene.checkAt,
          scene.resolveAt,
          12,
          ...pageTimes,
        ];
        for (const t of times) {
          const model = renderToStaticMarkup(
            createElement(PriorityTreeModels, { scene, t, colors: priorityTreeColors }),
          );
          expect(model).not.toMatch(/<(?:instancedMesh|primitive|skinnedMesh)\b|NaN|Infinity/);
          expect(count(model, 'mesh')).toBe(modelLedger(scene, t));
          // Seven nodes can each retain ten meshes; six correspondence links retain one each.
          expect(modelLedger(scene, t)).toBeLessThanOrEqual(scene.storyId === '27' ? 32 : 76);
          const svg = renderToStaticMarkup(
            createElement(
              'svg',
              null,
              createElement(PriorityTreeDiagram, { scene, t }),
              createElement(PriorityTreeFacts, { scene, t }),
            ),
          );
          const hosts = [...svg.matchAll(/<(?:svg|g|rect|path|text|tspan)\b/g)].length;
          expect(hosts).toBe(svgLedger(scene, t));
          expect(count(svg, 'svg')).toBe(1);
          expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
          expect(svg).not.toMatch(/NaN|Infinity|<mesh|<canvas|<foreignObject/);
          if (t === -1) expect(svg).toContain('opacity="0"');
          if (scene.storyId === '27') {
            maxima.priorityMeshes = Math.max(maxima.priorityMeshes, count(model, 'mesh'));
            maxima.prioritySvg = Math.max(maxima.prioritySvg, hosts);
          } else {
            maxima.treeMeshes = Math.max(maxima.treeMeshes, count(model, 'mesh'));
            maxima.treeSvg = Math.max(maxima.treeSvg, hosts);
          }
        }
      }
    expect(maxima).toEqual({
      priorityMeshes: 32,
      treeMeshes: 70,
      prioritySvg: 59,
      treeSvg: 59,
      pages: 61,
    });
  }, 60000);
  it('accounts separately for eight studio meshes/six instances and displayed plus scratch shadow meshes', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) meshes++;
      if (object instanceof InstancedMesh) instances += object.count;
    });
    expect({ meshes, instances }).toEqual({ meshes: 8, instances: 6 });
    room.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
    room.dispose();
    const root = 'src/main/remotion/compositions/explainer/';
    const studio = readFileSync(`${root}StudioEnvironment.tsx`, 'utf8');
    expect(studio).toContain('generator.fromScene(room, 0.04, 0.1, 100, { size: 128 })');
    expect(studio).toContain('room.dispose()');
    const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    expect(shadows.match(/new THREE.WebGLRenderTarget\(resolution, resolution\)/g)).toHaveLength(2);
    // Two shadow meshes are separate from authored assembly; room is temporary PMREM preparation.
  });
  it('audits actual zero/one Canvas ownership at the native boundary without invoking hooks or faking contexts', () => {
    const root = 'src/main/remotion/compositions/explainer/';
    const route = readFileSync(`${root}expansion/decisions/priority-tree-Scene.tsx`, 'utf8');
    expect(route).toMatch(/if \(scene.visualMode === 'diagram'\)\s*return\s*<DiagramStage/);
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).not.toMatch(/<Stage3D\b|<ThreeCanvas\b|<canvas\b/);
    const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    // Null routing adds no SVG: the factual surface stays single; Chrome is separate HTML.
    for (const opacity of [0, 0.5, 1]) {
      expect(hybridDiagramLayer(null, opacity)).toBeNull();
      expect(hybridDiagramLayer(undefined, opacity)).toBeNull();
      const diagram = createElement('g', { 'data-probe': 'non-null' });
      const layer = hybridDiagramLayer(diagram, opacity);
      expect(layer?.type).toBe(DiagramSurface);
      expect(layer?.props).toEqual({ opacity, children: diagram });
    }
    expect(hybrid).toContain('{hybridDiagramLayer(diagram, pose.diagramOpacity)}');
    expect(route).toContain('diagram={null}');
    expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(hybrid.match(/<DiagramChrome\b/g)).toHaveLength(1);
    for (const setting of ['driftDeg={0}', 'pushAmount={0}', 'bobAmount={0}'])
      expect(hybrid).toContain(setting);
    const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8');
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas\b|<canvas\b/);
    const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage).not.toMatch(/<mesh\b|<instancedMesh\b|<primitive\b/);
  });
});
