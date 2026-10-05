import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import {
  parseClaimSourceBoard,
  parseEvidenceToClaimTrace,
} from '../../../../../ai/explainer/expansion-reasoning-trace-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext } from '../../../../../ai/explainer/kind-spec';
import { DIAGRAM_REGIONS, labelLines, projectedDiagramRegion } from '../../diagrams/layout';
import { TraceDiagram } from './trace-Diagram';
import { TRACE_DEFAULT_VIEWPORT, traceCamera, traceModelPlacement, tracePose } from './trace-poses';

const packet = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning/trace.source.json', 'utf8'),
) as { stories: TemporalFixtureSeed[] };
for (const fixture of temporalSourceFixtures(packet.stories))
  it(`${fixture.id}: exact planar identities in both modes, reserved projection`, () => {
    const ctx = makeParseContext(fixture.words, fixture.window);
    const scene =
      fixture.id === '01'
        ? parseEvidenceToClaimTrace(fixture.proposal, ctx)
        : parseClaimSourceBoard(fixture.proposal, ctx);
    expect(ctx.issues).toEqual([]);
    if (!scene) throw new Error('Valid fixture rejected');
    const markup = (mode: 'diagram' | 'hybrid'): string =>
      renderToStaticMarkup(
        createElement(
          'svg',
          null,
          createElement(TraceDiagram, {
            scene: { ...scene, visualMode: mode },
            t: scene.resolveAt + 1,
          }),
        ),
      );
    const diagram = markup('diagram');
    const hybrid = markup('hybrid');
    const facts = (svg: string): string[] =>
      [
        ...svg.matchAll(
          /data-(?:entity-id|source-id|record-id|page-id|page-index|active|from-id|to-id|role)="[^"]*"/g,
        ),
      ].map((match) => match[0]);
    expect(facts(hybrid)).toEqual(facts(diagram));
    // Decorative kit glyphs intentionally differ. All nonempty precision text is identical.
    const texts = (svg: string): string[] =>
      [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
        .map((match) => match[1])
        .filter((text) => text.includes('<tspan'));
    const glyphStates = [...diagram.matchAll(/<text\b[^>]*>(Active|Disputed)<\/text>/g)].map(
      (match) => match[1],
    );
    expect(glyphStates).toEqual(
      tracePose(scene, scene.resolveAt + 1).entities.map((entity) =>
        entity.state === 'disputed' ? 'Disputed' : 'Active',
      ),
    );
    expect(hybrid).not.toMatch(/<text\b[^>]*>(Active|Disputed)<\/text>/);
    expect(texts(hybrid)).toEqual(texts(diagram));
    expect(hybrid).not.toBe(diagram);
    for (const entity of scene.entities) expect(diagram).toContain(`data-entity-id="${entity.id}"`);
    for (const record of scene.records) {
      for (const line of labelLines(record.content, 34))
        expect(diagram).toContain(line.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
      if (record.role !== 'claim') expect(diagram).toContain(`data-source-id="${record.sourceId}"`);
    }
    for (const relation of scene.relations) {
      expect(diagram).toContain(`data-from-id="${relation.fromId}"`);
      expect(diagram).toContain(`data-to-id="${relation.toId}"`);
      expect(diagram).toContain(`data-role="${relation.role}"`);
      for (const line of labelLines(relation.condition ?? '', 38))
        expect(diagram).toContain(line.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    }
    expect(diagram).toContain(
      scene.storyId === '01' ? 'Citation: provenance, not' : `${scene.state}: no adjudication`,
    );
    expect(diagram).not.toMatch(/<canvas|<mesh|<webgl/i);
    // Independent forward projection of the authored camera, including meet letterboxing.
    for (const viewport of [
      TRACE_DEFAULT_VIEWPORT,
      { width: 1376, height: 774, surface: { x: 0, y: 0, width: 1376, height: 774 } },
    ]) {
      const camera = traceCamera(viewport);
      for (const entity of tracePose(scene, scene.resolveAt + 1).entities) {
        const placement = traceModelPlacement(entity.x, entity.y, viewport);
        const projected = new Vector3(...placement.position).project(camera);
        const unit = Math.min(viewport.surface.width / 952, viewport.surface.height / 478);
        const expectedX =
          viewport.surface.x + (viewport.surface.width - 952 * unit) / 2 + entity.x * unit;
        const expectedY =
          viewport.surface.y + (viewport.surface.height - 478 * unit) / 2 + entity.y * unit;
        expect(((projected.x + 1) * viewport.width) / 2).toBeCloseTo(expectedX, 8);
        expect(((1 - projected.y) * viewport.height) / 2).toBeCloseTo(expectedY, 8);
        const right = new Vector3(1, 0, 0)
          .applyQuaternion(camera.quaternion)
          .multiplyScalar(placement.scale)
          .add(new Vector3(...placement.position))
          .project(camera);
        expect(((right.x - projected.x) * viewport.width) / 2).toBeCloseTo(30 * unit, 8);
        expect(placement.quaternion).toEqual(camera.quaternion.toArray());
      }
    }
    for (const aspect of ['9:16', '16:9'] as const)
      for (const layout of ['stack', 'stack-flipped', 'pip', 'over'] as const) {
        const rect = projectedDiagramRegion(DIAGRAM_REGIONS.body, layout, aspect);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(aspect === '9:16' ? 1920 : 1080);
      }
  });
