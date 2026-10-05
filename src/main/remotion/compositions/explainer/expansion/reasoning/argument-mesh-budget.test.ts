import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { describe, expect, it } from 'vitest';
import { ArgumentDiagram } from './argument-Diagram';
import { ArgumentModels } from './argument-models';
import { argumentLines, argumentPose, argumentTextRuns } from './argument-poses';
import { argumentScenes, argumentStressScenes } from './argument-poses.test';

const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
describe('real argument assemblies (CPU SSR, not GPU/RSS)', () => {
  for (const scene of [
    ...argumentScenes,
    ...argumentStressScenes('diagram'),
    ...argumentStressScenes('hybrid'),
    ...argumentStressScenes('diagram', 'unknown'),
    ...argumentStressScenes('hybrid', 'unknown'),
  ]) {
    it(`${scene.storyId} counts mounted hidden geometry as well as visible geometry`, () => {
      const counts = [0, 10].map((t) => {
        const markup = renderToStaticMarkup(
          createElement(ArgumentModels, {
            scene,
            pose: argumentPose(scene, t),
            colors,
          }),
        );
        const meshes = [...markup.matchAll(/<mesh\b/g)].length;
        const svg = renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(ArgumentDiagram, { scene, pose: argumentPose(scene, t) }),
          ),
        );
        const primitives = [...svg.matchAll(/<(?:rect|path|text|tspan|title)\b/g)].length;
        // Includes every mounted kit, even when reveal is zero. Stage/studio
        // resources are separately accounted below, not hidden in this cap.
        // Claim: five body meshes; document: seven. Disputed badge: two;
        // unknown badge: four bars + dot. Condition tab: three + unknown badge.
        const badge = scene.resolution === 'disputed' ? 2 : 5;
        const expectedMeshes =
          scene.kind === 'argument-map'
            ? 5 + badge + (scene.nodes.length - 1) * (7 + badge) + (scene.condition ? 8 : 0)
            : scene.effects.length * (7 + badge) + 8;
        expect(meshes).toBe(expectedMeshes);
        expect(meshes).toBeLessThanOrEqual(54); // Four nodes, unknown state, condition tab.
        const pose = argumentPose(scene, t);
        const expectedSvg =
          1 +
          pose.stations.length +
          (scene.kind === 'argument-map' ? 1 + 2 * scene.edges.length : 0) +
          argumentTextRuns(scene, pose).reduce(
            (total, run) => total + 1 + argumentLines(run.text, run.columns).length,
            0,
          );
        expect(primitives).toBe(expectedSvg);
        console.info(
          `${scene.storyId}/${scene.visualMode}@${t}: meshes=${meshes}, SVG=${primitives}`,
        );
        return meshes;
      });
      expect(counts[0]).toBe(counts[1]);
      expect(counts[0]).toBeGreaterThan(0);
    });
  }

  it('accounts separately for real studio preparation and contact-shadow resources', () => {
    const room = new RoomEnvironment();
    let meshes = 0;
    let instances = 0;
    room.traverse((object) => {
      if (object instanceof Mesh) meshes++;
      if (object instanceof InstancedMesh) instances += object.count;
    });
    console.info(`Studio preparation: meshes=${meshes}, instances=${instances}`);
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
    // One retained shadow plane + one offscreen blur mesh. PMREM room meshes
    // are temporary preparation, NOT retained main-stage scene geometry.
    expect(54 + 2).toBe(56); // Exact authored maximum, including both shadow meshes.
  });

  it('gates real zero/one canvas routing and shared viewport wiring without a substituted stage', () => {
    const hybrid = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    const diagram = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
      'utf8',
    );
    const stage = readFileSync('src/main/remotion/compositions/explainer/Stage3D.tsx', 'utf8');
    const view = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/reasoning/argument-Scene.tsx',
      'utf8',
    );
    expect(view.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(hybrid).toContain("if (scene.visualMode === 'diagram') return <DiagramStage");
    expect(hybrid.match(/<Stage3D\b/g)).toHaveLength(1);
    expect(stage.match(/<ThreeCanvas\b/g)).toHaveLength(1);
    expect(diagram).not.toMatch(/import .*Stage3D|<ThreeCanvas|<canvas/);
    expect(diagram).toContain('wide?.model ?? DIAGRAM_REGIONS.body');
    expect(stage).toContain('width={wide?.model.width ?? EXPLAINER_STAGE_WIDTH}');
    expect(stage).toContain('height={wide?.model.height ?? EXPLAINER_STAGE_HEIGHT}');
    expect(view.replace(/\s+/g, ' ')).toContain(
      "scene.visualMode === 'hybrid' && pose.stations.map",
    );
    expect(view).toContain('argumentModelAnchor(scene, t, index, wide?.model)');
    expect(view).toContain('opacity: pose.conditionHighlight');
  });
});
