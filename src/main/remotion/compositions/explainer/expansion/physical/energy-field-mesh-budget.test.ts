import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtrudeGeometry, InstancedMesh, Mesh, PlaneGeometry } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { expect, it } from 'vitest';
import { ExplainerProvider } from '../../stage';
import { EnergyFieldDiagram } from './energy-field-Diagram';
import { EnergyFieldModels, energyFieldSolids } from './energy-field-models';
import { energyFieldPose } from './energy-field-poses';
import { energyFieldFixtureScenes, energyFieldGeometry } from './energy-field-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#ffffff', text: '#000000', accent: '#555555', muted: '#888888' };
/** CPU host/attribute inventory only; transient PMREM is a separate source-derived ledger. */
function studioCost(): {
  meshes: number;
  instances: number;
  geometries: number;
  materials: number;
  vertices: number;
  indices: number;
} {
  const room = new RoomEnvironment(),
    geometries = new Set(),
    materials = new Set();
  let meshes = 0,
    instances = 0,
    vertices = 0,
    indices = 0;
  room.traverse((o) => {
    if (o instanceof Mesh) {
      meshes++;
      geometries.add(o.geometry);
      materials.add(o.material);
      const copies = o instanceof InstancedMesh ? o.count : 1;
      vertices += o.geometry.getAttribute('position').count * copies;
      indices += (o.geometry.index?.count ?? 0) * copies;
    }
    if (o instanceof InstancedMesh) {
      instances += o.count;
      o.dispose();
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
it('actual room and attached geometry/shadow path', () => {
  expect(studioCost()).toEqual({
    meshes: 8,
    instances: 6,
    geometries: 1,
    materials: 8,
    vertices: 312,
    indices: 468,
  });
  const kit = readFileSync(`${root}explanation-kit.tsx`, 'utf8');
  expect(kit).toContain('new RoundedBoxGeometry(');
  expect(kit).toContain('radius = 0.07');
  expect(kit).toMatch(/depth,\s*3,/);
  expect(kit).toContain('Math.min(radius, width / 2, height / 2, depth / 2)');
  expect(kit).toContain('<mesh geometry={geometry}');
  expect(kit).toContain('<Clay color={color} opacity={opacity} />');
  const model = readFileSync(`${root}expansion/physical/energy-field-models.tsx`, 'utf8');
  expect(model).toContain('energyFieldSolids(scene, pose).map');
  expect(model).toContain('size={solid.size}');
  expect(model).toContain("scene.storyId === '80' && !pose.fieldVisible");
  expect(model).toContain('key={solid.id}');
  expect(model).toContain("createIconShapes('lightning').body");
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  expect(contact.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
  expect(contact.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
  expect(contact).toContain('new THREE.PlaneGeometry(width, height)');
  expect(contact).toContain('new THREE.MeshDepthMaterial()');
  expect(contact.match(/new THREE\.ShaderMaterial\(/g)).toHaveLength(2);
  expect(contact.match(/React\.createElement\("meshBasicMaterial"/g)).toHaveLength(1);
  expect(contact.match(/new THREE\.WebGLRenderTarget\(/g)).toHaveLength(2);
  expect(contact).toContain('const blurPlane = new THREE.Mesh(planeGeometry)');
  expect(contact).toContain('geometry: planeGeometry');
  // Width/height/scale change positions, not this installed PlaneGeometry topology.
  // One shared plane, two host draws; named depth/blur/display materials only.
  const shadowPlane = new PlaneGeometry(1, 1).rotateX(Math.PI / 2);
  expect({
    geometryObjects: 1,
    hosts: 2,
    vertices: shadowPlane.getAttribute('position').count,
    indices: shadowPlane.index?.count,
    namedMaterials: 4,
    targets: 2,
  }).toEqual({
    geometryObjects: 1,
    hosts: 2,
    vertices: 4,
    indices: 6,
    namedMaterials: 4,
    targets: 2,
  });
  shadowPlane.dispose();
});
const cases = energyFieldFixtureScenes(),
  maxima = { meshes: 0, vertices: 0, svg: 0 };
for (const [index, scene] of cases.entries())
  it(`actual authored hosts, hidden geometry and every SVG page source ${index}`, () => {
    const base = energyFieldPose(scene, scene.setupAt),
      studio = studioCost(),
      actual = energyFieldGeometry(scene, base),
      count = actual.length;
    expect(count).toBe(
      scene.storyId === '79' ? 9 : base.arrows.filter((a) => a.available).length * 3,
    );
    const ids = actual.map(({ solid }) => solid.id);
    expect(new Set(ids).size).toBe(count);
    if (scene.storyId === '79') {
      expect(ids).toEqual([
        'battery-body',
        'battery-terminal',
        'electrical-load-housing',
        'electrical-load-symbol',
        'carrier-track',
        'energy-cart-bed',
        'energy-cart-wheel-left',
        'energy-cart-wheel-right',
        'energy-cart-bolt',
      ]);
      expect(
        actual.filter(({ solid }) => solid.kind === 'lightning').map(({ solid }) => solid.id),
      ).toEqual(['electrical-load-symbol', 'energy-cart-bolt']);
    }
    let vertices = 0;
    for (const { geometry, solid } of actual) {
      const expected = solid.kind === 'block' ? 1764 : 276;
      if (solid.kind === 'block') {
        expect(geometry).toBeInstanceOf(RoundedBoxGeometry);
        if (!(geometry instanceof RoundedBoxGeometry))
          throw new Error('Wrong attached block geometry');
        expect([
          geometry.parameters.width,
          geometry.parameters.height,
          geometry.parameters.depth,
        ]).toEqual(solid.size);
      } else {
        expect(geometry).toBeInstanceOf(ExtrudeGeometry);
        if (!(geometry instanceof ExtrudeGeometry)) throw new Error('Wrong attached icon geometry');
        expect(geometry.parameters.options).toEqual({
          depth: 0.24,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.045,
          bevelThickness: 0.045,
          curveSegments: 16,
        });
      }
      expect(geometry.getAttribute('position').count).toBe(expected);
      expect(geometry.getAttribute('normal').count).toBe(expected);
      expect(geometry.getAttribute('uv').count).toBe(expected);
      expect(geometry.index).toBeNull();
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      vertices += geometry.getAttribute('position').count;
      geometry.dispose();
    }
    expect(vertices).toBe(scene.storyId === '79' ? 12900 : count * 1764);
    expect(count).toBeLessThanOrEqual(27);
    expect(vertices).toBeLessThanOrEqual(47628);
    maxima.meshes = Math.max(maxima.meshes, count);
    maxima.vertices = Math.max(maxima.vertices, vertices);
    for (const time of [scene.setupAt, scene.actionAt + 1, scene.resolveAt + 1])
      for (const hidden of [false, true]) {
        const pose = {
          ...energyFieldPose(scene, time),
          fieldVisible: !hidden,
          reveal: hidden ? 0 : 1,
        };
        expect(energyFieldSolids(scene, pose).map((solid) => solid.id)).toEqual(ids);
        const html = renderToStaticMarkup(
          createElement(
            ExplainerProvider,
            {
              value: {},
            },
            createElement(EnergyFieldModels, { scene, pose, colors }),
          ),
        );
        expect([...html.matchAll(/<mesh\b/g)]).toHaveLength(count);
        expect([...html.matchAll(/<mesh\b[^>]*geometry="\[object Object\]"/g)]).toHaveLength(count);
        expect([...html.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(count);
        expect(html).not.toMatch(
          /NaN|Infinity|<(?:instancedMesh|skinnedMesh|primitive|boxGeometry)\b/,
        );
        expect(count + studio.meshes + 2).toBe(count + 10);
        expect(studio.instances).toBe(6);
      }
    for (let page = 0; page < base.pages.length; page++)
      for (const hidden of [false, true]) {
        const pose = { ...base, page, fieldVisible: !hidden, reveal: hidden ? 0 : 1 };
        const svg = renderToStaticMarkup(
            createElement('svg', null, createElement(EnergyFieldDiagram, { scene, pose })),
          ),
          tags = [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].map((m) => m[1]);
        expect(tags.every((t) => ['svg', 'g', 'rect', 'path', 'circle', 'text'].includes(t))).toBe(
          true,
        );
        expect(tags.length).toBe(
          (scene.storyId === '79' ? 9 : 23) +
            base.pages[page].qualification.length +
            base.pages[page].lines.length,
        );
        expect(tags.length).toBeLessThanOrEqual(33);
        expect(tags.filter((t) => t === 'rect')).toHaveLength(1);
        expect(tags.filter((t) => t === 'path' || t === 'circle')).toHaveLength(
          scene.storyId === '79' ? 1 : 9,
        );
        expect(svg).not.toMatch(
          /NaN|Infinity|<canvas|<image|<foreignObject|clipPath|textLength|ellipsis/,
        );
        maxima.svg = Math.max(maxima.svg, tags.length);
      }
  });
it('reaches exact authored maxima including opacity-zero geometry', () => {
  expect(maxima).toEqual({ meshes: 27, vertices: 47628, svg: 33 });
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
it('audits production zero/one WebGL dispatch, persistent exact diagram/Chrome and single shared studio/shadow branch', () => {
  const route = readFileSync(`${root}expansion/physical/energy-field-Scene.tsx`, 'utf8');
  expect(route).toContain("scene.visualMode === 'diagram'");
  expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
  expect(route).toContain('diagram={null}');
  expect(route).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  expect(route).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
  const diagram = readFileSync(`${root}diagrams/DiagramStage.tsx`, 'utf8'),
    hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8'),
    stage = readFileSync(`${root}Stage3D.tsx`, 'utf8');
  expect(diagram).not.toMatch(/import[^;]*Stage3D|<Canvas\b/);
  for (const source of [diagram, hybrid])
    expect(source).toContain('<DiagramChrome scene={scene} />');
  expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
  expect(hybrid).toContain('groundY={-1.4}');
  for (const tag of ['ThreeCanvas', 'StudioEnvironment', 'ContactShadows'])
    expect(stage.match(new RegExp(`<${tag}\\b`, 'g'))).toHaveLength(1);
  expect(stage).toContain('resolution={512}');
});
