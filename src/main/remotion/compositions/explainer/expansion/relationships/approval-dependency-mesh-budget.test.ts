import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstancedMesh, Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { expect, it } from 'vitest';
import { ApprovalDependencyDiagram } from './approval-dependency-Diagram';
import { ApprovalDependencyModels } from './approval-dependency-models';
import { approvalDependencyPages, approvalDependencyPose } from './approval-dependency-poses';
import {
  approvalDependencyCases,
  approvalDependencyStressSeed,
  parseApprovalDependency,
} from './approval-dependency-test-fixtures';

const root = 'src/main/remotion/compositions/explainer/';
const colors = { surface: '#f6ecd9', text: '#23100c', accent: '#9f75ff', muted: '#81706a' };
it('composed maximum models, including static hidden geometry, with separate real studio/shadow costs', () => {
  const room = new RoomEnvironment();
  let studioMeshes = 0,
    instances = 0;
  room.traverse((object) => {
    if (object instanceof Mesh) studioMeshes++;
    if (object instanceof InstancedMesh) instances += object.count;
  });
  expect([studioMeshes, instances]).toEqual([8, 6]);
  room.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
  });
  room.dispose();
  const stage = readFileSync(`${root}Stage3D.tsx`, 'utf8'),
    studio = readFileSync(`${root}StudioEnvironment.tsx`, 'utf8');
  expect([...stage.matchAll(/<ThreeCanvas\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<StudioEnvironment\b/g)]).toHaveLength(1);
  expect([...stage.matchAll(/<ContactShadows\b/g)]).toHaveLength(1);
  expect(studio).toContain('new RoomEnvironment()');
  const contact = readFileSync('node_modules/@react-three/drei/core/ContactShadows.js', 'utf8');
  const shadows = [...contact.matchAll(/new THREE\.Mesh\(|React\.createElement\("mesh",/g)].length;
  expect(shadows).toBe(2);
  let maximumMeshes = 0;
  for (const id of ['35', '36'] as const) {
    const scene = parseApprovalDependency(approvalDependencyStressSeed(id, 'known', true));
    const counts = new Set<number>();
    for (const t of [-1, scene.actionAt, scene.responseAt + 0.31, scene.checkAt + 0.31, 12, NaN]) {
      const model = renderToStaticMarkup(
        createElement(ApprovalDependencyModels, { scene, t, colors }),
      );
      const count = [...model.matchAll(/<mesh\b/g)].length;
      counts.add(count);
      maximumMeshes = Math.max(maximumMeshes, count);
      expect(model).not.toMatch(/<instancedMesh\b|<primitive\b|<skinnedMesh\b|NaN|Infinity/);
      expect([...model.matchAll(/<meshPhysicalMaterial\b/g)]).toHaveLength(count);
    }
    expect(counts.size).toBe(1);
    expect([...counts]).toEqual([id === '35' ? 35 : 56]);
  }
  expect(maximumMeshes).toBe(56);
  console.info(
    `approval-dependency composed SSR: authored max=${maximumMeshes}; studio=${studioMeshes} meshes/${instances} instances; shadows=${shadows}; hybrid mesh hosts total=${maximumMeshes + studioMeshes + shadows}`,
  );
});
it('actual per-page SVG costs include the complete typed graph and retained source endpoints/statuses', () => {
  let maximumSvg = 0;
  for (const scene of approvalDependencyCases()) {
    const pages = approvalDependencyPages(scene),
      samples = new Map<number, number>();
    for (let f = 0; f <= 360; f++) samples.set(approvalDependencyPose(scene, f / 30).page, f / 30);
    expect(samples.size).toBe(pages.length);
    for (const [index, t] of samples) {
      const svg = renderToStaticMarkup(
        createElement('svg', null, createElement(ApprovalDependencyDiagram, { scene, t })),
      );
      maximumSvg = Math.max(maximumSvg, [...svg.matchAll(/<([a-zA-Z][\w:-]*)\b/g)].length);
      expect([...svg.matchAll(/data-page-id=/g)]).toHaveLength(1);
      expect(svg).not.toMatch(/<canvas|<mesh\b|NaN|Infinity|textLength|lengthAdjust/);
      if (scene.storyId === '36') {
        expect([...svg.matchAll(/data-relation-id=/g)]).toHaveLength(scene.relations.length);
        for (const r of scene.relations)
          expect(svg).toContain(
            `data-relation-id="${r.id}" data-type="${r.type}" data-status="${r.state}" data-from-id="${r.fromId}" data-to-id="${r.toId}" data-direction="${r.type === 'dependency' ? 'from requires to' : 'source direction'}"`,
          );
      } else {
        const record = scene.records.find((r) => r.id === pages[index].factId);
        if (record) {
          expect(svg).toContain(
            `data-record-id="${record.id}" data-type="${record.type}" data-status="${record.state}" data-from-id="${record.actorId}" data-to-id="${record.targetId}"`,
          );
          // Frozen contract binds owner -> approver for requests/handoffs, the reverse only for authorization.
          expect(record.actorId).toBe(
            record.type === 'authorization' ? scene.approverId : scene.ownerId,
          );
          expect(record.targetId).toBe(
            record.type === 'authorization' ? scene.ownerId : scene.approverId,
          );
        }
      }
    }
  }
  console.info(`approval-dependency actual per-page SVG maximum=${maximumSvg}`);
  expect(maximumSvg).toBe(102);
});
it('production zero/one-canvas composition uses response handoff and persistent precision plane', () => {
  const scene = readFileSync(
    `${root}expansion/relationships/approval-dependency-Scene.tsx`,
    'utf8',
  );
  expect(scene).toContain("scene.visualMode === 'diagram'");
  expect(scene).toContain('<DiagramStage');
  expect(scene).toContain('diagram={null}');
  expect(scene).toContain('handoffBeat="response"');
  expect(scene).toContain('<DiagramSurface>{diagram}</DiagramSurface>');
  expect([...scene.matchAll(/<HybridStage\b/g)]).toHaveLength(1);
  const hybrid = readFileSync(`${root}diagrams/HybridStage.tsx`, 'utf8');
  expect([...hybrid.matchAll(/<Stage3D\b/g)]).toHaveLength(1);
  expect(hybrid).toContain('diagram === null || diagram === undefined ? null');
  for (const name of ['poses.ts', 'models.tsx', 'Diagram.tsx', 'Scene.tsx']) {
    const source = readFileSync(
      `${root}expansion/relationships/approval-dependency-${name}`,
      'utf8',
    );
    expect(source).not.toMatch(
      /Math\.random|setTimeout|setInterval|Date\.|<Canvas\b|<ThreeCanvas\b|<primitive\b|<instancedMesh\b|useFrame\(/,
    );
  }
});
it('only actual source authorization can open the station; requests/handoffs and unresolved results cannot', () => {
  for (const state of [
    'allowed',
    'denied',
    'pending',
    'unknown',
    'missing',
    'disputed',
    'conditional',
  ]) {
    const scene = parseApprovalDependency(approvalDependencyStressSeed('35', 'known', true, state));
    const before = renderToStaticMarkup(
      createElement(ApprovalDependencyModels, { scene, t: scene.actionAt + 0.31, colors }),
    );
    const after = renderToStaticMarkup(
      createElement(ApprovalDependencyModels, { scene, t: scene.responseAt + 0.31, colors }),
    );
    expect(before).toContain('position="0,0.18,0"');
    expect(before).not.toContain('position="0,0.63,0"');
    expect(after).toContain(state === 'allowed' ? 'position="0,0.63,0"' : 'position="0,0.18,0"');
    expect(scene.result.state).toBe('conditional');
  }
});
