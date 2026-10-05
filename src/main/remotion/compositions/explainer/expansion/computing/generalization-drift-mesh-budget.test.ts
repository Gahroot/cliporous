import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { ExplainerProvider } from '../../stage';
import { GeneralizationDriftDiagram } from './generalization-drift-Diagram';
import { GeneralizationDriftModels } from './generalization-drift-models';
import { generalizationDriftPose } from './generalization-drift-poses';
import {
  generalizationDriftCarrierGeometry,
  generalizationDriftCases,
} from './generalization-drift-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#ffffff', text: '#000000', accent: '#555555', muted: '#888888' };
/** Separate CPU ledgers for opacity-zero carriers, RoomEnvironment and shadow hosts.
 * Their sum is not a complete runtime/GPU resource ceiling: PMREM generation is transient,
 * separately source-audited below and disposed before its retained environment texture. */
function studioCost() {
  const room = new RoomEnvironment();
  let meshes = 0,
    instances = 0,
    vertices = 0,
    indices = 0;
  const geometries = new Set(),
    materials = new Set();
  room.traverse((object) => {
    if (object instanceof Mesh) {
      meshes++;
      geometries.add(object.geometry);
      materials.add(object.material);
      const copies = object instanceof InstancedMesh ? object.count : 1;
      vertices += object.geometry.getAttribute('position').count * copies;
      indices += (object.geometry.index?.count ?? 0) * copies;
    }
    if (object instanceof InstancedMesh) {
      instances += object.count;
      object.dispose();
    }
  });
  room.dispose();
  return {
    meshes,
    instances,
    geometries: geometries.size,
    materials: materials.size,
    vertices,
    indices,
  };
}
describe('generalization/drift actual composed host ledger (CPU only)', () => {
  it('audits the attached RoundedBoxGeometry path, actual attributes, installed room and hidden shadow passes', () => {
    const primitive = readFileSync(`${root}explanation-kit.tsx`, 'utf8');
    expect(primitive).toContain('new RoundedBoxGeometry(');
    expect(primitive).toContain('Math.min(radius, width / 2, height / 2, depth / 2)');
    expect(primitive).toContain('radius = 0.07');
    expect(primitive).toMatch(/depth,\s*3,/);
    expect(primitive).toContain('<mesh geometry={geometry}');
    expect(primitive).toContain('<Clay color={color} opacity={opacity} />');
    const kit = readFileSync(`${root}expansion/kits/computing.tsx`, 'utf8')
      .split('export function ComputingRecordClay')[1]
      .split('export function ComputingActorSvg')[0];
    expect(kit.match(/<ClayBlock\b/g)).toHaveLength(3);
    const carriers = generalizationDriftCarrierGeometry();
    expect(
      carriers.map(({ geometry, position }) => {
        const parameters = geometry.parameters;
        if (
          !('segments' in parameters) ||
          typeof parameters.segments !== 'number' ||
          !('radius' in parameters) ||
          typeof parameters.radius !== 'number'
        )
          throw new Error('Installed rounded geometry lacks its actual constructor parameters');
        return {
          size: [parameters.width, parameters.height, parameters.depth],
          position,
          segments: parameters.segments,
          radius: parameters.radius,
        };
      }),
    ).toEqual([
      { size: [0.78, 0.52, 0.07], position: [0, 0, 0], segments: 3, radius: 0.035 },
      { size: [0.06, 0.4, 0.025], position: [-0.29, 0, 0.05], segments: 3, radius: 0.0125 },
      { size: [0.14, 0.12, 0.025], position: [0.27, 0.18, 0.05], segments: 3, radius: 0.0125 },
    ]);
    for (const { geometry } of carriers) {
      expect(geometry.getAttribute('position').count).toBe(1764);
      expect(geometry.getAttribute('normal').count).toBe(1764);
      expect(geometry.getAttribute('uv').count).toBe(1764);
      expect(geometry.index).toBeNull();
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
    expect(studioCost()).toEqual({
      meshes: 8,
      instances: 6,
      geometries: 1,
      materials: 8,
      vertices: 312,
      indices: 468,
    });
    expect(readFileSync(`${root}StudioEnvironment.tsx`, 'utf8')).toContain('new RoomEnvironment()');
    const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
    expect(contact.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
    expect(contact.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
    expect(contact).toContain('new THREE.PlaneGeometry(width, height)');
    expect(contact).toContain('new THREE.MeshDepthMaterial()');
    expect(contact.match(/new THREE\.ShaderMaterial\(/g)).toHaveLength(2);
    expect(contact.match(/React\.createElement\("meshBasicMaterial"/g)).toHaveLength(1);
    expect(contact.match(/new THREE\.WebGLRenderTarget\(/g)).toHaveLength(2);
  });
  it('source-audits fixed-128 transient PMREM generation separately from measured carrier/room and shadow hosts', () => {
    const studio = readFileSync(`${root}StudioEnvironment.tsx`, 'utf8');
    expect(studio).toContain('generator.fromScene(room, 0.04, 0.1, 100, { size: 128 })');
    expect(studio).toMatch(/finally\s*\{[\s\S]*room\.dispose\(\);[\s\S]*generator\.dispose\(\);/);
    expect(studio).toContain('scene.environment = target.texture');
    const pmrem = readFileSync('node_modules/three/src/extras/PMREMGenerator.js', 'utf8');
    expect(pmrem).toContain('const LOD_MIN = 4;');
    expect(pmrem).toContain('const EXTRA_LODS = 6;');
    expect(pmrem).toContain('const totalLods = lodMax - LOD_MIN + 1 + EXTRA_LODS;');
    expect(pmrem).toContain('const cubeFaces = 6;');
    expect(pmrem).toContain('const vertices = 6;');
    expect(pmrem).toContain('lodMeshes.push( new Mesh( planes, null ) )');
    expect(pmrem).toContain('this._backgroundBox = new Mesh(');
    expect(pmrem).toContain('new BoxGeometry(),');
    expect(pmrem).toContain("name: 'PMREM.Background'");
    expect(pmrem).toContain('this._blurMaterial = _getBlurShader(');
    expect(pmrem).toContain('this._ggxMaterial = _getGGXShader(');
    expect(pmrem).toContain('this._lodMeshes[ i ].geometry.dispose()');
    expect(pmrem).toContain('this._backgroundBox.geometry.dispose()');
    // Source-derived allocation inventory, NOT measured GPU allocations or peak residency.
    // 128 = 2^7; ten six-face planes plus one off-tree background box.
    const planes = Math.log2(128) - 4 + 1 + 6;
    expect({
      planes,
      meshObjects: planes + 1,
      geometryObjects: planes + 1,
      planeVertices: planes * 6 * 6,
      namedMaterialObjects: 3,
    }).toEqual({
      planes: 10,
      meshObjects: 11,
      geometryObjects: 11,
      planeVertices: 360,
      namedMaterialObjects: 3,
    });
  });
  for (const [index, scene] of generalizationDriftCases().entries())
    it(`source case ${index}: every page, hidden model geometry and all SVG hosts`, () => {
      const base = generalizationDriftPose(scene, scene.setupAt),
        studio = studioCost();
      let maxSvg = 0;
      // Every page is also rendered at zero reveal: hidden hosts are not excluded from cost.
      for (let page = 0; page < base.pages.length; page++)
        for (const reveal of [0, 1]) {
          const pose = { ...base, page, reveal };
          const model = renderToStaticMarkup(
            createElement(
              ExplainerProvider,
              {
                value: {},
              },
              createElement(GeneralizationDriftModels, { scene, pose, colors }),
            ),
          );
          expect([...model.matchAll(/<mesh\b/g)]).toHaveLength(6);
          expect([...model.matchAll(/<mesh\b[^>]*geometry="\[object Object\]"/g)]).toHaveLength(6);
          expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(6);
          expect(model).not.toMatch(
            /NaN|Infinity|<(?:instancedMesh|skinnedMesh|primitive|boxGeometry)\b/,
          );
          expect(6 + studio.meshes + 2).toBe(16);
          expect(studio.instances).toBe(6);
          expect(6 * 1764).toBe(10584);
          const svg = renderToStaticMarkup(
            createElement('svg', null, createElement(GeneralizationDriftDiagram, { scene, pose })),
          );
          const tags = [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].map((m) => m[1]);
          expect(tags.every((tag) => ['svg', 'g', 'rect', 'path', 'text'].includes(tag))).toBe(
            true,
          );
          // Root + top group + two lanes. Each lane: group, rect, role, state, category, path,
          // footer; each wrapped dataset/detail line contributes one text host.
          const datasets = scene.records.map(
            (r) => scene.entities.find((e) => e.id === r.datasetId)?.label ?? r.datasetId,
          );
          const expected =
            16 +
            datasets.reduce((sum, label) => sum + Math.ceil(Array.from(label).length / 18), 0) +
            pose.pages[page].lanes.reduce((sum, lane) => sum + lane.length, 0);
          expect(tags.length).toBe(expected);
          expect(tags.length).toBeLessThanOrEqual(36);
          expect(tags.filter((tag) => tag === 'rect')).toHaveLength(2);
          expect(tags.filter((tag) => tag === 'path')).toHaveLength(2);
          expect(svg).not.toMatch(
            /NaN|Infinity|<canvas|<image|<foreignObject|clipPath|textLength|ellipsis/,
          );
          maxSvg = Math.max(maxSvg, tags.length);
        }
      expect(maxSvg).toBeGreaterThanOrEqual(30);
    });
  it('audits production zero/one WebGL dispatch, persistent exact diagram/Chrome and single shared studio/shadow branch', () => {
    const route = readFileSync(`${root}expansion/computing/generalization-drift-Scene.tsx`, 'utf8');
    expect(route).toContain("scene.visualMode === 'diagram'");
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route).toContain('diagram={null}');
    expect(route).toContain('{persistentDiagramSurface}');
    expect(route).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
    const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8'),
      hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8'),
      stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
    expect(diagram).not.toMatch(/import[^;]*Stage3D|<Canvas\b/);
    for (const source of [diagram, hybrid])
      expect(source).toMatch(
        /<DiagramChrome scene=\{scene\}(?: settledOutcome=\{settledOutcome\})? \/>/,
      );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(hybrid).toContain('groundY={-1.4}');
    for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
      expect(stage.match(new RegExp(`<${tag}\\b`, 'g'))).toHaveLength(1);
    expect(stage).toContain('resolution={512}');
  });
});
