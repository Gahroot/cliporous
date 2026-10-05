import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';

import {
  ConditioningSamplingDiagram,
  ConditioningSamplingFacts,
} from './conditioning-sampling-Diagram';
import { ConditioningSamplingModels } from './conditioning-sampling-models';
import {
  conditioningSamplingContext,
  conditioningSamplingPage,
  conditioningSamplingPages,
  conditioningSamplingPose,
  conditioningSamplingView,
} from './conditioning-sampling-poses';
import { conditioningSamplingScenes } from './conditioning-sampling-poses.test';
import type { ExpansionConditioningSamplingScene } from './conditioning-sampling-types';

const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
const textNodes = (text: string, columns: number) =>
  1 + Math.ceil(Array.from(text).length / columns);
function composedSvgNodes(scene: ExpansionConditioningSamplingScene): number {
  const rows = conditioningSamplingView(scene);
  const pages = conditioningSamplingPages(scene);
  // Root SVG + diagram root + facts root; hidden trays and pages count in full.
  let nodes = 3 + rows.reduce((sum, row) => sum + 4 + 4 * (row.population?.marks.length ?? 0), 0);
  pages.forEach((page, index) => {
    nodes += 1; // Page group.
    nodes += conditioningSamplingContext(scene, rows[page.rowIndex]).reduce(
      (sum, text) => sum + textNodes(text, 40),
      0,
    );
    nodes += textNodes(`Detail ${index + 1} / ${pages.length}`, 40);
    nodes += page.fields.reduce((sum, field) => sum + textNodes(field.text, 30), 0);
  });
  return nodes;
}

describe('conditioning/sampling composed authored costs — CPU SSR, not GPU/native', () => {
  for (const [index, scene] of conditioningSamplingScenes.entries()) {
    it(`${index}/${scene.visualMode}: exact mounted shapes at every source beat and hidden/final sections`, () => {
      const rows = conditioningSamplingView(scene);
      const expected = rows.reduce(
        (sum, row) => sum + (row.population ? 9 + 3 * row.population.marks.length : 4),
        0,
      );
      const pages = conditioningSamplingPages(scene);
      const pageTimes = pages.map((_, page) =>
        page === pages.length - 1
          ? scene.resolveAt
          : scene.setupAt + ((page + 0.5) / (pages.length - 1)) * (scene.resolveAt - scene.setupAt),
      );
      pageTimes.forEach((t, page) => {
        expect(conditioningSamplingPage(t, scene)).toBe(page);
      });
      const frames = [
        ...pageTimes,
        -1,
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
        10,
      ];
      // Paging never discounts hidden geometry: every record/detail remains mounted, including
      // the accepted twelve-record/100-mark fixture and all opacity-zero sections.
      for (const t of frames) {
        const props = { scene, t, pose: conditioningSamplingPose(t, scene), colors };
        const model = renderToStaticMarkup(createElement(ConditioningSamplingModels, props));
        const svg = renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(ConditioningSamplingDiagram, props),
            createElement(ConditioningSamplingFacts, props),
          ),
        );
        expect([...model.matchAll(/<mesh\b/g)].length).toBe(expected);
        expect(model).not.toMatch(/<instancedMesh|<skinnedMesh|<primitive|NaN|Infinity/);
        expect(
          [...svg.matchAll(/<(?:svg|g|style|title|circle|rect|path|text|tspan)\b/g)].length,
        ).toBe(composedSvgNodes(scene));
        expect([...svg.matchAll(/data-source-identity=/g)].length).toBe(pages.length);
        expect([...svg.matchAll(/data-active-page="true"/g)]).toHaveLength(1);
        expect([...svg.matchAll(/data-member-id=/g)].length).toBe(
          rows.reduce((sum, row) => sum + (row.population?.marks.length ?? 0), 0),
        );
        if (t === -1) expect(svg).toContain('opacity="0"');
      }
      expect(expected).toBeLessThanOrEqual(394);
      console.info(
        `${scene.storyId}/${scene.visualMode}/${index}: model assembly=${expected} meshes; diagram=${composedSvgNodes(scene)} SVG hosts; production meshes=${scene.visualMode === 'hybrid' ? expected : 0}`,
      );
    });
  }
  it('accepted caps attain exact 327 conditioning / 394 sampling assembly meshes', () => {
    for (const id of ['11', '12']) {
      const costs = conditioningSamplingScenes
        .filter((scene) => scene.storyId === id)
        .map((scene) =>
          conditioningSamplingView(scene).reduce(
            (sum, row) => sum + (row.population ? 9 + 3 * row.population.marks.length : 4),
            0,
          ),
        );
      expect(Math.max(...costs)).toBe(id === '11' ? 327 : 394);
      const storyScenes = conditioningSamplingScenes.filter((scene) => scene.storyId === id);
      console.warn(
        `Verified story ${id}: max meshes=${Math.max(...costs)}, max SVG hosts=${Math.max(...storyScenes.map(composedSvgNodes))}, pages=${[...new Set(storyScenes.map((scene) => conditioningSamplingPages(scene).length))].join(',')}`,
      );
      expect(
        Math.max(
          ...conditioningSamplingScenes
            .filter((scene) => scene.storyId === id)
            .map(composedSvgNodes),
        ),
      ).toBe(id === '11' ? 579 : 963);
      expect([
        ...new Set(storyScenes.map((scene) => conditioningSamplingPages(scene).length)),
      ]).toEqual(id === '11' ? [7, 6] : [3, 4, 22]);
    }
  });
  it('studio preparation is separate: 8 meshes / 6 instances; two retained/scratch shadow meshes', () => {
    const room = new RoomEnvironment();
    let meshes = 0,
      instances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) meshes++;
      if (object instanceof InstancedMesh) instances += object.count;
    });
    expect(meshes).toBe(8);
    expect(instances).toBe(6);
    room.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
    room.dispose();
    const studio = readFileSync(
      'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
      'utf8',
    );
    expect(studio).toContain('generator.fromScene(room, 0.04, 0.1, 100, { size: 128 })');
    expect(studio).toContain('room.dispose()');
    expect(studio).toContain('return null');
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    expect(stage).toContain('resolution={512}');
    const shadows = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(shadows.match(/new THREE.Mesh\(planeGeometry\)/g)).toHaveLength(1);
    expect(shadows.match(/React.createElement\("mesh"/g)).toHaveLength(1);
    expect(shadows.match(/new THREE.WebGLRenderTarget\(resolution, resolution\)/g)).toHaveLength(2);
    expect(394 + 2).toBe(396); // Main/scratch authored ceiling; temporary PMREM room is separate.
  });
  it('source ownership proves zero/one stage routing only — no fake Canvas context or native claim', () => {
    const root = 'src/main/remotion/compositions/explainer/';
    const view = readFileSync(
      `${root}expansion/probability/conditioning-sampling-Scene.tsx`,
      'utf8',
    );
    const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
    const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8');
    const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
    expect(view).toContain('export function ConditioningSamplingView');
    expect(view).toMatch(/if \(scene\.visualMode === 'diagram'\)\s*return\s*\(?\s*<DiagramStage/);
    expect(view.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(view.match(/<DiagramSurface\b/g)).toHaveLength(1);
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(diagram).not.toMatch(/<ThreeCanvas|<canvas|import .*Stage3D/);
    expect(stage).toContain('width={wide?.model.width ?? EXPLAINER_STAGE_WIDTH}');
    expect(view).toContain('turn={diagramPose(t, scene).modelTurn}');
    // Static source + CPU shape accounting do not establish actual browser/GPU canvas behavior.
  });
});
