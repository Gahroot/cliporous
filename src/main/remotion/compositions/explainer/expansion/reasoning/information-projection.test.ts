import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiagramChrome, DiagramSurface } from '../../diagrams/DiagramStage';
import { InformationDiagram } from './information-Diagram';
import { InformationModelOverlay } from './information-models';
import { informationModelProjection, informationPose } from './information-poses';
import { informationSourceScenes } from './information-poses.fixtures';

const escaped = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

/** Inspect inherited opacity, not just strings retained on invisible detail pages. */
function informationSvgNodes(svg: string) {
  const stack: { tag: string; opacity: number; attributes: Record<string, string> }[] = [];
  const nodes: {
    tag: string;
    opacity: number;
    attributes: Record<string, string>;
    parents: Record<string, string>[];
  }[] = [];
  for (const match of svg.matchAll(/<(\/)?([\w-]+)([^>]*?)(\/?)>/g)) {
    if (match[1]) {
      stack.pop();
      continue;
    }
    const attributes = Object.fromEntries(
      [...match[3].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]),
    );
    const opacity = (stack.at(-1)?.opacity ?? 1) * Number(attributes.opacity ?? 1);
    nodes.push({
      tag: match[2],
      opacity,
      attributes,
      parents: stack.map((entry) => entry.attributes),
    });
    if (!match[4]) stack.push({ tag: match[2], opacity, attributes });
  }
  return nodes;
}

function informationDiagramMarkup(
  scene: ReturnType<typeof informationSourceScenes>[number],
  t: number,
) {
  return renderToStaticMarkup(
    createElement(
      DiagramSurface,
      null,
      createElement(InformationDiagram, { scene, pose: informationPose(scene, t) }),
    ),
  );
}

function assertTextGeometry(svg: string) {
  for (const node of informationSvgNodes(svg).filter(
    (entry) => entry.tag === 'text' && entry.attributes['data-source-text'],
  )) {
    const a = node.attributes;
    const size = Number(a['font-size']),
      lines = Number(a['data-line-count']);
    const width = Number(a['data-text-width']),
      height = Number(a['data-text-height']);
    const x = Number(a.x),
      baseline = Number(a.y);
    expect(lines * size * 1.1, a['data-source-text']).toBeLessThanOrEqual(height + size * 0.1);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(952);
    expect(baseline - size).toBeGreaterThanOrEqual(0);
    expect(baseline + (lines - 1) * size * 1.1, a['data-source-text']).toBeLessThanOrEqual(478);
  }
  for (const node of informationSvgNodes(svg).filter((entry) => entry.tag === 'rect')) {
    const a = node.attributes;
    expect(Number(a.x)).toBeGreaterThanOrEqual(0);
    expect(Number(a.y)).toBeGreaterThanOrEqual(0);
    expect(Number(a.x) + Number(a.width)).toBeLessThanOrEqual(952);
    expect(Number(a.y) + Number(a.height)).toBeLessThanOrEqual(478);
  }
}

describe('information actual planar and projected model presentation', () => {
  it('retains identities and non-causal/non-false qualifications with measured authored text geometry', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        const svg = informationDiagramMarkup(scene, scene.resolveAt + 0.2);
        expect(svg).toContain('viewBox="0 0 952 478"');
        expect(svg).toContain(escaped(scene.scope));
        expect(svg).not.toMatch(/…|NaN|Infinity|<canvas/);
        assertTextGeometry(svg);
        // Outcome is actual shared chrome, not a nonexistent diagram-body label.
        const chromeSource = readFileSync(
          'src/main/remotion/compositions/explainer/diagrams/DiagramStage.tsx',
          'utf8',
        );
        expect(chromeSource).toContain('text={scene.outcome}');
        expect(DiagramChrome).toBeTypeOf('function');
        if (scene.storyId === '05') {
          for (const entity of scene.entities)
            expect(svg).toContain(`data-source-text="${escaped(entity.label)}"`);
          expect(svg).toContain('data-role="association"');
          expect(svg).toContain('data-causal-status="unestablished"');
          expect(svg).toContain(escaped(scene.causalStatus.qualification));
          if (scene.factor.certainty === 'possible') {
            expect(svg).toContain(`${scene.factor.qualification} affects both endpoints`);
            expect(svg).toContain('stroke-dasharray="7 5"');
          }
          if (scene.factor.condition) expect(svg).toContain(escaped(scene.factor.condition));
          const edges = informationSvgNodes(svg).filter(
            (node) => node.tag === 'path' && node.attributes['data-from-id'],
          );
          expect(
            edges.map((node) => [node.attributes['data-from-id'], node.attributes['data-to-id']]),
          ).toEqual(scene.factor.affectsIds.map((id) => [scene.factor.entityId, id]));
        } else {
          expect(svg).toContain(escaped(scene.nonFalse.qualification));
          const visible = informationSvgNodes(svg).filter(
            (node) => node.tag === 'g' && node.opacity === 1,
          );
          expect(
            visible.find((node) => node.attributes['data-resolution'])?.attributes[
              'data-resolution'
            ],
          ).toBe('unresolved');
          expect(
            visible
              .filter((node) => node.attributes['data-record-id'])
              .map((node) => node.attributes['data-record-id']),
          ).toEqual([scene.focusRecordId]);
        }
        expect(svg).toEqual(informationDiagramMarkup(scene, scene.resolveAt + 1));
      }
  });

  it('shows every record detail at a real sample time, including unknown qualification, content and owner', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        if (scene.storyId !== '06') continue;
        for (const [index, record] of scene.records.entries()) {
          // Second pass pages every record during the source response/check window.
          const t =
            scene.responseAt +
            ((index + 0.5) / scene.records.length) * (scene.resolveAt - scene.responseAt);
          const pose = informationPose(scene, t);
          expect(pose.detailIndex).toBe(index);
          const svg = informationDiagramMarkup(scene, t);
          assertTextGeometry(svg);
          const details = informationSvgNodes(svg).filter(
            (node) => node.tag === 'g' && node.attributes['data-record-id'] && node.opacity === 1,
          );
          expect(details.map((node) => node.attributes['data-record-id'])).toEqual([record.id]);
          const texts = informationSvgNodes(svg).filter(
            (node) =>
              node.tag === 'text' &&
              node.opacity === 1 &&
              node.parents.some((parent) => parent['data-record-id'] === record.id),
          );
          const owner = scene.entities.find((entity) => entity.id === record.ownerId);
          expect(texts.map((node) => node.attributes['data-source-text'])).toEqual([
            escaped(`${record.id}\n${record.ownerId}`),
            escaped(
              `${owner?.label}\n${record.topic}\n${record.state === 'known' ? record.content : record.qualification}`,
            ),
          ]);
          expect(details[0].attributes['data-owner-id']).toBe(record.ownerId);
          expect(details[0].attributes['data-state']).toBe(record.state);
        }
      }
  });

  it('projects hybrid identity anchors onto the actual model rectangle and emits no overlay in diagram mode', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        for (const t of [
          scene.setupAt + 0.2,
          scene.actionAt,
          scene.responseAt,
          scene.resolveAt + 0.2,
        ]) {
          const pose = informationPose(scene, t);
          const svg = renderToStaticMarkup(createElement(InformationModelOverlay, { scene, pose }));
          if (mode === 'diagram') {
            expect(svg).toBe('');
            continue;
          }
          expect(svg).not.toMatch(/NaN|Infinity|<canvas/);
          const indices =
            scene.storyId === '05' ? scene.entities.map((_, index) => index) : [pose.detailIndex];
          const nodes = informationSvgNodes(svg);
          expect(
            nodes
              .filter((node) => node.attributes['data-projected-id'])
              .map((node) => node.attributes['data-projected-id']),
          ).toEqual(
            indices.map((index) =>
              scene.storyId === '05' ? scene.entities[index].id : scene.records[index].id,
            ),
          );
          const circles = nodes.filter((node) => node.tag === 'circle');
          for (const [offset, index] of indices.entries()) {
            const p = informationModelProjection(scene, pose.time, index);
            expect(Number(circles[offset].attributes.cx)).toBeCloseTo(p.x, 8);
            expect(Number(circles[offset].attributes.cy)).toBeCloseTo(p.y, 8);
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(1080);
            expect(p.y - 24 - 16).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThanOrEqual(960);
          }
        }
      }
  });

  it('wires the projected overlay alongside the existing shared hybrid route', () => {
    const route = readFileSync(
      'src/main/remotion/compositions/explainer/expansion/reasoning/information-Scene.tsx',
      'utf8',
    );
    expect(route.match(/<HybridStage\b/g)).toHaveLength(1);
    expect(route.match(/<InformationModelOverlay\b/g)).toHaveLength(1);
    expect(route).toMatch(/<InformationModelOverlay\s+scene=\{scene\}\s+pose=\{pose\}/);
    expect(route).not.toMatch(/<Stage3D|<ThreeCanvas|<canvas/);
  });
});
