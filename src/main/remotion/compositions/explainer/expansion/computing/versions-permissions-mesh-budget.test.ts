import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { DiagramSurface } from '../../diagrams/DiagramStage';
import { hybridDiagramLayer } from '../../diagrams/HybridStage';
import { ExplainerProvider } from '../../stage';
import { VersionsPermissionsDiagram } from './versions-permissions-Diagram';
import { VersionsPermissionsModels } from './versions-permissions-models';
import { versionsPermissionsPose } from './versions-permissions-poses';
import { versionsPermissionsCases } from './versions-permissions-test-fixtures';

describe('versions and permissions composed authored host costs (CPU, not GPU/RSS)', () => {
  it('counts all actual model/SVG hosts including hidden geometry, offline studio and source-owned shadow passes', () => {
    const room = new RoomEnvironment();
    let studioMeshes = 0,
      studioInstances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) studioMeshes++;
      if (object instanceof InstancedMesh) studioInstances += object.count;
    });
    expect([studioMeshes, studioInstances]).toEqual([8, 6]);
    room.dispose();
    const studioSource = readFileSync(
      'src/main/remotion/compositions/explainer/StudioEnvironment.tsx',
      'utf8',
    );
    expect(studioSource).toContain('new RoomEnvironment()');
    const shadowSource = readFileSync(
      'node_modules/@react-three/drei/core/ContactShadows.js',
      'utf8',
    );
    // One returned mesh and one off-tree blur mesh: neither hidden host may be omitted.
    expect(shadowSource.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
    expect(shadowSource.match(/React\.createElement\("mesh"/g)).toHaveLength(1);
    const shadows = 2;
    let maxMeshes = 0,
      maxSvg = 0;
    for (const scene of versionsPermissionsCases()) {
      const base = versionsPermissionsPose(scene, scene.setupAt);
      for (let page = 0; page < base.pages.length; page++) {
        const pose = { ...base, page };
        // Real React SSR runs useWideStage/Clay in their provider, never calls hooks directly.
        const model = renderToStaticMarkup(
          createElement(
            ExplainerProvider,
            {
              value: {},
            },
            createElement(VersionsPermissionsModels, {
              scene,
              pose,
              colors: { surface: '#ffffff', text: '#000000', accent: '#555555', muted: '#888888' },
            }),
          ),
        );
        const meshes = [...model.matchAll(/<mesh\b/g)].length;
        expect(meshes).toBe(pose.pages[page].fact ? 2 : 0);
        expect(meshes).toBeLessThanOrEqual(2);
        expect([...model.matchAll(/<boxGeometry\b/g)]).toHaveLength(meshes);
        expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(meshes);
        expect(model).not.toMatch(/NaN|Infinity|<instancedMesh/);
        maxMeshes = Math.max(maxMeshes, meshes + studioMeshes + shadows);
        const svg = renderToStaticMarkup(
          createElement(VersionsPermissionsDiagram, { scene, pose }),
        );
        const hosts = [...svg.matchAll(/<(?:g|rect|path|text)\b/g)].length;
        maxSvg = Math.max(maxSvg, hosts);
        expect(hosts).toBeLessThanOrEqual(56);
        const surface = renderToStaticMarkup(
          createElement(
            ExplainerProvider,
            {
              value: {},
            },
            createElement(
              DiagramSurface,
              null,
              createElement(VersionsPermissionsDiagram, { scene, pose }),
            ),
          ),
        );
        expect([...surface.matchAll(/<svg\b/g)]).toHaveLength(1);
        expect([...surface.matchAll(/<(?:svg|g|rect|path|text)\b/g)]).toHaveLength(hosts + 1);
        expect(hosts + 1).toBeLessThanOrEqual(57);
      }
    }
    expect(maxMeshes).toBe(12);
    expect(maxSvg).toBe(56);
  });
  it('keeps zero Canvas diagram, one HybridStage and shared persistent planar facts in the actual view source', () => {
    const source = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/computing/versions-permissions-Scene.tsx',
      'utf8',
    );
    expect(source).toContain("scene.visualMode === 'diagram'");
    expect(source).toContain('<DiagramStage scene={scene}>');
    expect(source.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(source).toContain('diagram={null}');
    expect(source).toContain('{persistentDiagramSurface}');
    expect(source).not.toMatch(/<Canvas|<ThreeCanvas|Date\.|Math\.random|fetch\(/);
    expect(hybridDiagramLayer(null, 1)).toBeNull();
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    for (const setting of [
      'driftDeg={0}',
      'pushAmount={0}',
      'bobAmount={0}',
      'groundY={-1.4}',
      'shadowScale={9}',
      'rotation={[0, pose.modelTurn, 0]}',
    ])
      expect(hybrid).toContain(setting);
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(stage.match(/<StudioEnvironment\b/g)).toHaveLength(1);
    expect(stage.match(/<ContactShadows\b/g)).toHaveLength(1);
    for (const setting of [
      'width={wide?.model.width ?? EXPLAINER_STAGE_WIDTH}',
      'height={wide?.model.height ?? EXPLAINER_STAGE_HEIGHT}',
      'left: wide?.model.x ?? 0',
      'top: wide?.model.y ?? 0',
      'scale={shadowScale}',
      'position={[0, groundY, 0]}',
    ])
      expect(stage).toContain(setting);
  });
});
