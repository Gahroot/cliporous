import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DiagramChrome, DiagramSurface } from '../../diagrams/DiagramStage';
import { DIAGRAM_REGIONS } from '../../diagrams/layout';
import { diagramPose } from '../../diagrams/motion';
import { EXPLANATION_CAMERA } from '../../explanation-layout';
import { cameraRig, projectToStage } from '../../three-helpers';
import { ArgumentDiagram } from './argument-Diagram';
import {
  argumentLines,
  argumentModelAnchor,
  argumentModelPosition,
  argumentPose,
  argumentTextRuns,
} from './argument-poses';
import { argumentScenes, argumentStressScenes } from './argument-poses.test';
import { ReasoningArgumentView } from './argument-Scene';
import type { ExpansionReasoningArgumentScene } from './argument-types';

// The clock and Stage3D ownership marker are test boundaries. Real HybridStage,
// diagrams, chrome, models and camera stay production code. A marker proves stage
// routing, NOT a mounted canvas or GPU output; native proof remains required.
const clock = vi.hoisted(() => ({ frame: 0 }));
vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920, durationInFrames: 300 }),
}));

vi.mock('../../Stage3D', () => ({
  Stage3D: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-stage3d-owner': 'true' }, children),
}));

export function argumentSvg(scene: ExpansionReasoningArgumentScene, t: number): string {
  return renderToStaticMarkup(
    createElement(
      DiagramSurface,
      null,
      createElement(ArgumentDiagram, { scene, pose: argumentPose(scene, t) }),
    ),
  );
}
const escapeText = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
const times = (scene: ExpansionReasoningArgumentScene): number[] =>
  [scene.setupAt, scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt].map(
    (t) => t + 0.25,
  );

describe('argument actual factual text and authored projection (CPU)', () => {
  for (const scene of [
    ...argumentScenes,
    ...argumentStressScenes('diagram'),
    ...argumentStressScenes('hybrid'),
  ]) {
    it(`${scene.storyId}/${scene.visualMode}: every detail page is visible and preserves complete quotations`, () => {
      const pages = times(scene).map((t) => ({
        t,
        pose: argumentPose(scene, t),
        markup: argumentSvg(scene, t),
      }));
      const records =
        scene.kind === 'argument-map'
          ? scene.nodes.map((node) => ({
              id: node.entityId,
              text: node.statement,
              actorId: node.actorId,
            }))
          : scene.effects.map((effect) => ({
              id: effect.alternativeId,
              text: effect.text,
              actorId: effect.actorId,
            }));
      for (const record of records) {
        const time = Array.from({ length: 301 }, (_, frame) => frame / 30).find(
          (t) =>
            argumentTextRuns(scene, argumentPose(scene, t)).some(
              (run) => run.text === record.text && run.opacity === 1,
            ) &&
            (scene.visualMode === 'diagram' ||
              diagramPose(t, scene, 'action').diagramOpacity === 1),
        );
        const page =
          time === undefined
            ? undefined
            : { pose: argumentPose(scene, time), markup: argumentSvg(scene, time) };
        expect(page, `no visible detail page for ${record.id}`).toBeDefined();
        if (!page) continue;
        const run = argumentTextRuns(scene, page.pose).find((entry) => entry.text === record.text);
        expect(run).toBeDefined();
        if (!run) continue;
        expect(argumentLines(run.text, run.columns).join('')).toBe(record.text);
        const mounted = page.markup.match(
          new RegExp(`<text[^>]*data-source-run="${run.id}"[^>]*>(.*?)</text>`),
        )?.[1];
        expect(mounted?.replace(/<[^>]+>/g, '')).toBe(escapeText(record.text));
        expect(page.markup).toContain(`data-actor-id="${record.actorId}"`);
        expect(page.markup).toContain(`data-entity-id="${record.id}"`);
      }
      for (const { pose, markup } of pages) {
        expect(markup).toContain('viewBox="0 0 952 478"');
        expect(markup).not.toMatch(/<canvas|foreignObject|<image/);
        for (const run of argumentTextRuns(scene, pose)) {
          expect(markup).toContain(`data-source-text="${escapeText(run.text)}"`);
          // Conservative authored advance envelope, not physical font measurement.
          const lines = argumentLines(run.text, run.columns);
          const width = Math.max(...lines.map((line) => Array.from(line).length)) * run.size * 0.65;
          expect(run.x).toBeGreaterThanOrEqual(0);
          expect(run.y - run.size).toBeGreaterThanOrEqual(0);
          expect(run.x + width).toBeLessThanOrEqual(952);
          expect(run.y + (lines.length - 1) * run.size * 1.2).toBeLessThanOrEqual(478);
          const station = pose.stations.find((entry) => run.id.startsWith(`${entry.id}-`));
          if (!run.id.includes('-lens-') && station) {
            expect(run.x + width).toBeLessThanOrEqual(station.x + 444);
            expect(run.y + (lines.length - 1) * run.size * 1.2).toBeLessThanOrEqual(
              scene.kind === 'argument-map' ? station.y + 108 : 474,
            );
          }
        }
      }
    });
  }

  it('both raw-parser modes retain the same essential facts, IDs, edge roles/states and conditions, not decoration equality', () => {
    const diagrams = argumentStressScenes('diagram');
    const hybrids = argumentStressScenes('hybrid');
    for (const [i, diagram] of diagrams.entries()) {
      const hybrid = hybrids[i];
      const { visualMode: _diagramMode, ...diagramFacts } = diagram;
      const { visualMode: _hybridMode, ...hybridFacts } = hybrid;
      expect(hybridFacts).toEqual(diagramFacts);
      expect(diagram.entities).toHaveLength(i === 0 ? 8 : 5);
      if (diagram.kind === 'argument-map') {
        expect(diagram.nodes).toHaveLength(4);
        expect(diagram.edges).toHaveLength(3);
        for (const scene of [diagram, hybrid]) {
          for (const edge of diagram.edges) {
            const markup = argumentSvg(scene, 10);
            expect(markup).toContain(
              `data-link-from="${edge.fromId}" data-link-to="${edge.toId}" data-role="${edge.role}" data-state="${edge.state}"`,
            );
            expect(markup).toContain(
              `data-source-text="${escapeText(`${edge.state} · ${edge.qualifier}`)}"`,
            );
          }
        }
      }
      for (const scene of [diagram, hybrid]) {
        clock.frame = 300;
        const chrome = renderToStaticMarkup(createElement(DiagramChrome, { scene }));
        // Chrome uses word wrapping, which omits separator whitespace at line
        // breaks but must not omit any factual characters or qualifications.
        expect(chrome.replace(/<[^>]+>/g, '').replace(/\s/g, '')).toContain(
          scene.condition?.replace(/\s/g, ''),
        );
        expect(chrome).toContain(scene.resolution);
        expect(chrome).toContain('Source-stated');
      }
      for (const t of times(diagram)) {
        expect(argumentTextRuns(hybrid, argumentPose(hybrid, t))).toEqual(
          argumentTextRuns(diagram, argumentPose(diagram, t)),
        );
      }
    }
  });

  it('fits the accepted maximum condition text within its actual chrome region', () => {
    for (const scene of argumentStressScenes('diagram')) {
      const chrome = renderToStaticMarkup(createElement(DiagramChrome, { scene }));
      const leading = Number(
        chrome.match(/font-size:24px;font-weight:550;line-height:([\d.]+)/)?.[1],
      );
      expect(leading).toBe(1.1);
      const chars = Array.from(scene.condition ?? '');
      const lines = Array.from({ length: Math.ceil(chars.length / 38) }, (_, i) =>
        chars.slice(i * 38, (i + 1) * 38).join(''),
      );
      expect(lines.join('')).toBe(scene.condition);
      expect(lines.length * 24 * leading).toBeLessThanOrEqual(DIAGRAM_REGIONS.condition.height);
      expect(Math.max(...lines.map((line) => line.length)) * 24 * 0.65).toBeLessThanOrEqual(
        DIAGRAM_REGIONS.condition.width,
      );
    }
  });

  it('bounds a 96-character unbroken condition without shrinking or losing text (layout-only probe)', () => {
    const scene = { ...argumentStressScenes('diagram')[0], condition: `if ${'W'.repeat(93)}` };
    const chrome = renderToStaticMarkup(createElement(DiagramChrome, { scene }));
    expect(chrome).toContain('font-size:24px;font-weight:550;line-height:1.1');
    const chars = Array.from(scene.condition);
    const lines = Array.from({ length: Math.ceil(chars.length / 38) }, (_, i) =>
      chars.slice(i * 38, (i + 1) * 38).join(''),
    );
    for (const line of lines) expect(chrome).toContain(`<div>${line}</div>`);
    expect(lines.join('')).toBe(scene.condition);
    expect(lines.length * 24 * 1.1).toBeLessThanOrEqual(DIAGRAM_REGIONS.condition.height);
    expect(Math.max(...lines.map((line) => line.length)) * 24).toBeLessThanOrEqual(
      DIAGRAM_REGIONS.condition.width,
    );
  });

  it('actual frame routes own zero/one shared stage and retain essential chrome (not native canvas proof)', () => {
    clock.frame = 300;
    for (const mode of ['diagram', 'hybrid'] as const) {
      for (const scene of argumentStressScenes(mode)) {
        const markup = renderToStaticMarkup(createElement(ReasoningArgumentView, { scene }));
        expect([...markup.matchAll(/data-stage3d-owner="true"/g)]).toHaveLength(
          mode === 'diagram' ? 0 : 1,
        );
        if (mode === 'diagram') expect(markup).not.toMatch(/<canvas\b/);
        expect([...markup.matchAll(/<svg\b/g)]).toHaveLength(1);
        expect(markup).toContain('Source-stated');
        expect(markup).toContain(`data-argument-condition="${escapeText(scene.condition ?? '')}"`);
        expect(markup).toContain('data-authored-condition-highlight="0"');
      }
    }
  });

  it('projects model ID overlays through the actual static hybrid camera, turn and native viewport', () => {
    const source = readFileSync(
      'src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx',
      'utf8',
    );
    expect(source).toContain('camera = EXPLANATION_CAMERA');
    for (const prop of ['driftDeg', 'pushAmount', 'bobAmount'])
      expect(source).toContain(`${prop}={0}`);
    expect(source).toContain('rotation={[0, pose.modelTurn, 0]}');
    const scene = argumentStressScenes('hybrid')[0];
    for (const viewport of [
      { x: 0, y: 0, width: 1080, height: 960 },
      { x: 500, y: 100, width: 1300, height: 800 },
    ]) {
      for (const t of [0, scene.actionAt, scene.actionAt + 0.25, 10]) {
        const camera = cameraRig(EXPLANATION_CAMERA, t, {
          driftDeg: 0,
          pushAmount: 0,
          bobAmount: 0,
        });
        const turn = diagramPose(t, scene, 'action').modelTurn;
        for (let i = 0; i < 4; i++) {
          const [x, y, z] = argumentModelPosition(i);
          const projected = projectToStage(
            camera,
            [x * Math.cos(turn) + z * Math.sin(turn), y, z * Math.cos(turn) - x * Math.sin(turn)],
            viewport.width,
            viewport.height,
          );
          const anchor = argumentModelAnchor(scene, t, i, viewport);
          expect(anchor).toEqual({ x: viewport.x + projected.x, y: viewport.y + projected.y });
          expect(anchor.x).toBeGreaterThan(viewport.x);
          expect(anchor.x).toBeLessThan(viewport.x + viewport.width);
          expect(anchor.y).toBeGreaterThan(viewport.y);
          expect(anchor.y).toBeLessThan(viewport.y + viewport.height);
        }
      }
    }
  });
});
