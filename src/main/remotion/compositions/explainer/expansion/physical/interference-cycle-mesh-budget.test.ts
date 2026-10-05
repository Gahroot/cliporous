import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh, PlaneGeometry } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { ExplainerProvider } from '../../stage';
import { InterferenceCycleDiagram } from './interference-cycle-Diagram';
import { InterferenceCycleModels } from './interference-cycle-models';
import {
  interferenceCyclePages,
  interferenceCyclePose,
  interferenceCycleTraces,
} from './interference-cycle-poses';
import {
  interferenceCycleCarrierGeometry,
  interferenceCycleCases,
} from './interference-cycle-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#ffffff', text: '#000000', accent: '#555555', muted: '#888888' };
/** Separate CPU ledgers for opacity-zero carriers, RoomEnvironment and shadow hosts.
 * Their sum is not a complete runtime/GPU resource ceiling: PMREM generation is transient,
 * separately source-audited below and disposed before its retained environment texture. */
function studioCost(): {
  meshes: number;
  instances: number;
  geometries: number;
  materials: number;
  vertices: number;
  indices: number;
} {
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

it('actual RoomEnvironment, attached ClayBlock, hidden ContactShadows and zero/one canvas source audit', () => {
  expect(studioCost()).toEqual({
    meshes: 8,
    instances: 6,
    geometries: 1,
    materials: 8,
    vertices: 312,
    indices: 468,
  });
  const block = readFileSync(`${root}explanation-kit.tsx`, 'utf8');
  expect(block).toContain('new RoundedBoxGeometry(');
  expect(block).toMatch(/depth,\s*3,/);
  expect(block).toContain('radius = 0.07');
  expect(block).toContain('Math.min(radius, width / 2, height / 2, depth / 2)');
  expect(block).toContain('<mesh geometry={geometry}');
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect(contact.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
  expect(contact.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
  expect(contact).toContain('new THREE.PlaneGeometry(width, height)');
  expect(contact).toContain('new THREE.MeshDepthMaterial()');
  expect(contact.match(/new THREE\.ShaderMaterial\(/g)).toHaveLength(2);
  expect(contact.match(/React\.createElement\("meshBasicMaterial"/g)).toHaveLength(1);
  expect(contact.match(/new THREE\.WebGLRenderTarget\(/g)).toHaveLength(2);
  const plane = new PlaneGeometry();
  expect(plane.getAttribute('position').count).toBe(4);
  expect(plane.index?.count).toBe(6);
  plane.dispose();
  const route = readFileSync(`${root}expansion/physical/interference-cycle-Scene.tsx`, 'utf8');
  expect(route).toContain("scene.visualMode === 'diagram'");
  expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
  expect(route).toContain('diagram={null}');
  expect(route.match(/<DiagramSurface\b/g)).toHaveLength(1);
  expect(route).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
  expect(hybrid).toMatch(
    /<DiagramChrome scene=\{scene\}(?: settledOutcome=\{settledOutcome\})? \/>/,
  );
  expect(hybrid).toContain('groundY={-1.4}');
  const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8');
  expect(diagram).not.toMatch(/import[^;]*Stage3D|<Canvas\b/);
  expect(diagram).toMatch(
    /<DiagramChrome scene=\{scene\}(?: settledOutcome=\{settledOutcome\})? \/>/,
  );
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
    expect(stage.match(new RegExp(`<${tag}\\b`, 'g'))).toHaveLength(1);
  expect(stage).toContain('resolution={512}');
  for (const name of ['poses.ts', 'models.tsx', 'Diagram.tsx', 'Scene.tsx'])
    expect(
      readFileSync(`${root}expansion/physical/interference-cycle-${name}`, 'utf8'),
    ).not.toMatch(/Math\.random|Date\.|performance\.|useFrame\(|setInterval|fetch\(/);
});

const cases = interferenceCycleCases().filter((s) => s.visualMode === 'diagram');
for (const [index, scene] of cases.entries()) {
  it(`source ${index}: exact composed model/hidden geometry ledger and all current-page SVG hosts`, () => {
    const count = scene.storyId === '77' ? 2 : 3;
    const studio = studioCost();
    const reached = new Map<number, number>();
    const pages = interferenceCyclePages(scene);
    for (let f = Math.ceil(scene.setupAt * 30); f <= Math.floor(scene.resolveAt * 30); f++) {
      const page = interferenceCyclePose(scene, f / 30).page;
      if (!reached.has(page)) reached.set(page, f);
    }
    expect(reached.size).toBe(pages.length);
    let maxSvg = 0;
    for (const t of [
      scene.setupAt - 1,
      scene.setupAt,
      scene.actionAt,
      scene.checkAt,
      scene.resolveAt,
      scene.resolveAt + 1,
    ]) {
      const carriers = interferenceCycleCarrierGeometry(scene, t);
      const model = renderToStaticMarkup(
        createElement(
          ExplainerProvider,
          {
            value: {},
          },
          createElement(InterferenceCycleModels, { scene, t, colors }),
        ),
      );
      expect(model).not.toMatch(/NaN|Infinity|<(?:instancedMesh|skinnedMesh|primitive)\b/);
      expect([...model.matchAll(/<mesh\b/g)]).toHaveLength(count * carriers.length);
      expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(count * carriers.length);
      expect([...model.matchAll(/<mesh\b[^>]*geometry="\[object Object\]"/g)]).toHaveLength(
        count * carriers.filter((c) => c.tag === 'attachedRoundedBox').length,
      );
      const actual = [
        ...model.matchAll(
          /<(boxGeometry|cylinderGeometry|torusGeometry|sphereGeometry)\b[^>]*args="([^"]*)"/g,
        ),
      ].map((m) => [m[1], m[2].split(',').map(Number)]);
      const expected = carriers
        .filter((c) => c.tag !== 'attachedRoundedBox')
        .map((c) => [c.tag, c.args]);
      expect(actual).toEqual(Array.from({ length: count }, () => expected).flat());
      let vertices = 0,
        indices = 0,
        triangles = 0;
      for (const { geometry, tag } of carriers) {
        const positions = geometry.getAttribute('position');
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        expect(geometry.getAttribute('normal').count).toBe(positions.count);
        expect(geometry.getAttribute('uv').count).toBe(positions.count);
        if (tag === 'attachedRoundedBox') {
          expect(positions.count).toBe(1764);
          expect(geometry.index).toBeNull();
        }
        vertices += positions.count;
        indices += geometry.index?.count ?? 0;
        triangles += (geometry.index?.count ?? positions.count) / 3;
        geometry.dispose();
      }
      vertices *= count;
      indices *= count;
      triangles *= count;
      const ledger = { meshes: count * carriers.length, vertices, indices, triangles };
      expect(ledger).toEqual(
        scene.storyId === '78'
          ? { meshes: 21, vertices: 2688, indices: 9828, triangles: 3276 }
          : carriers.filter((c) => c.tag === 'attachedRoundedBox').length === 3
            ? { meshes: 12, vertices: 11040, indices: 864, triangles: 3816 }
            : { meshes: 12, vertices: 17840, indices: 384, triangles: 6008 },
      );
      // Separate carrier+room+two shadow draw-host ceiling. Excludes transient PMREM inventory above.
      expect(ledger.meshes + studio.meshes + 2).toBeLessThanOrEqual(31);
      expect(vertices + studio.vertices + 8).toBeLessThanOrEqual(18160);
      expect(indices + studio.indices + 12).toBeLessThanOrEqual(10308);
      expect(triangles + studio.indices / 3 + 4).toBeLessThanOrEqual(6168);
      expect(ledger.meshes + studio.geometries + 1).toBeLessThanOrEqual(23);
      expect(ledger.meshes + studio.materials + 4).toBeLessThanOrEqual(33);
      expect(studio.instances).toBe(6);
    }
    for (const [page, frame] of reached) {
      const svg = renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(InterferenceCycleDiagram, { scene, t: frame / 30 }),
        ),
      );
      const tags = [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].map((m) => m[1]);
      expect(
        tags.every((tag) => ['svg', 'g', 'rect', 'path', 'polyline', 'text'].includes(tag)),
      ).toBe(true);
      const traces = interferenceCycleTraces(scene);
      expect(tags.length).toBe(
        pages[page].lines.length + (scene.storyId === '78' ? 22 : traces ? 12 + traces.length : 13),
      );
      expect(tags.length).toBeLessThanOrEqual(30);
      expect(tags.filter((tag) => tag === 'text').length).toBe(
        pages[page].lines.length + (scene.storyId === '78' ? 11 : traces ? 6 : 7),
      );
      expect(svg).not.toMatch(
        /NaN|Infinity|<canvas|<image|<foreignObject|clipPath|textLength|ellipsis/,
      );
      maxSvg = Math.max(maxSvg, tags.length);
    }
    expect(maxSvg).toBeGreaterThan(0);
  });
}
