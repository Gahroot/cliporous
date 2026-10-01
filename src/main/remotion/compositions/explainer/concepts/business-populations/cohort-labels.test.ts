// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EXPLANATION_CAMERA, EXPLANATION_EVIDENCE_TOP } from '../../explanation-layout';
import { ExplainerProvider, STAGE } from '../../stage';
import { type CameraSpec, projectToStage } from '../../three-helpers';
import { cohortPose } from './poses';
import { BusinessPopulationsSceneView } from './Scene';
import { populationFixtures } from './test-fixtures';
import { BUSINESS_POPULATIONS_LIMITS, type CustomerCohortScene } from './types';

const clock = vi.hoisted(() => ({ frame: 0, width: 1080 }));
vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: 30, width: clock.width, height: 960, durationInFrames: 360 }),
}));
// Keep the real ExplanationStage rails, TechText and Connector; only skip WebGL.
vi.mock('../../mechanisms/MechanismStage', () => ({
  MechanismStage: ({
    overlay,
    camera,
  }: {
    overlay?: (camera: CameraSpec) => ReactNode;
    camera: CameraSpec;
  }) => overlay?.(camera),
}));

const fixture = populationFixtures.find((item) => item.scene.kind === 'customer-cohort');
if (!fixture || fixture.scene.kind !== 'customer-cohort') throw new Error('Missing cohort fixture');
const base = fixture.scene;
const variants = [
  { layout: 'over', aspect: '16:9', text: '#23100c', bgOuter: '#f6ecd9' },
  { layout: 'over', aspect: '16:9', text: '#f6ecd9', bgOuter: '#23100c' },
  { layout: 'stack', aspect: '9:16', text: '#23100c', bgOuter: '#f6ecd9' },
  { layout: 'stack', aspect: '9:16', text: '#f6ecd9', bgOuter: '#23100c' },
] as const;

function sceneAtCapacity(retained: number, spaced = true): CustomerCohortScene {
  const label = (i: number) =>
    spaced
      ? `${i}W WWWWWWWW WWWWWW`
      : `${i}${'W'.repeat(BUSINESS_POPULATIONS_LIMITS.actorLabel - 1)}`;
  return {
    ...base,
    members: Array.from({ length: BUSINESS_POPULATIONS_LIMITS.originalCustomers }, (_, i) => ({
      id: `original-${i}`,
      label: label(i),
      status: i < retained ? 'retained' : 'departed',
    })),
    arrivals: Array.from({ length: BUSINESS_POPULATIONS_LIMITS.newCustomers }, (_, i) => ({
      id: `arrival-${i}`,
      label: label(BUSINESS_POPULATIONS_LIMITS.originalCustomers + i),
    })),
    counts: {
      starting: BUSINESS_POPULATIONS_LIMITS.originalCustomers,
      retained,
      departed: BUSINESS_POPULATIONS_LIMITS.originalCustomers - retained,
      arrivals: BUSINESS_POPULATIONS_LIMITS.newCustomers,
    },
  };
}

function render(scene: CustomerCohortScene, t: number, variant: (typeof variants)[number]) {
  clock.frame = Math.round(t * 30);
  clock.width = variant.aspect === '16:9' ? 1920 : 1080;
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    createElement(ExplainerProvider, {
      value: { ...variant, palette: { ...STAGE, text: variant.text, bgOuter: variant.bgOuter } },
      // biome-ignore lint/correctness/noChildrenProp: ExplainerProvider requires children in its props type.
      children: createElement(BusinessPopulationsSceneView, { scene }),
    }),
  );
  return host;
}

type Box = { x: number; y: number; width: number; height: number };
function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function checkLabels(
  scene: CustomerCohortScene,
  t: number,
  variant: (typeof variants)[number] = variants[0],
) {
  const host = render(scene, t, variant);
  const pose = cohortPose(scene, clock.frame / 30);
  const actors = [...pose.members, ...pose.arrivals];
  const boxes = actors.map((actor) => {
    const label = [...host.querySelectorAll('div')].find(
      (element) => element.firstChild?.textContent === actor.label,
    );
    if (!label) throw new Error(`Missing full label for ${actor.id}`);
    const status = 'status' in actor ? (pose.separated ? actor.status : 'original') : 'new';
    expect(label.textContent).toBe(`${actor.label}${status}`);
    expect(label.querySelectorAll('br')).toHaveLength(1);
    const size = Number.parseFloat(label.style.fontSize);
    expect(size).toBeGreaterThanOrEqual(22);
    expect(label.style.overflow).not.toBe('hidden');
    expect(label.style.textOverflow).not.toBe('ellipsis');
    const box = {
      x: Number.parseFloat(label.style.left),
      y: Number.parseFloat(label.style.top),
      width: Number.parseFloat(label.style.width),
      // Reserve three full name lines (including wide, spaced 18-char names) + status.
      height: 4 * size * Number.parseFloat(label.style.lineHeight),
    };
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(box.x).toBeGreaterThanOrEqual(64);
    expect(box.x + box.width).toBeLessThanOrEqual(1016);
    expect(box.y).toBeGreaterThanOrEqual(300);
    expect(box.y + box.height).toBeLessThan(EXPLANATION_EVIDENCE_TOP - 8);
    const point = projectToStage(EXPLANATION_CAMERA, actor.position);
    const connector = label.previousElementSibling;
    expect(connector?.tagName.toLowerCase()).toBe('svg');
    expect(
      connector?.querySelector('path')?.getAttribute('d')?.endsWith(`L${point.x} ${point.y}`),
    ).toBe(true);
    return box;
  });
  for (let i = 0; i < boxes.length; i++) {
    for (const other of boxes.slice(i + 1)) expect(overlaps(boxes[i], other)).toBe(false);
    for (const actor of actors) {
      const corners = [-0.3, 0.3].flatMap((x) =>
        [0, 1.02].flatMap((y) =>
          [-0.24, 0.27].map((z) =>
            projectToStage(EXPLANATION_CAMERA, [
              actor.position[0] + x,
              actor.position[1] + y,
              actor.position[2] + z,
            ]),
          ),
        ),
      );
      const x = Math.min(...corners.map((point) => point.x));
      const y = Math.min(...corners.map((point) => point.y));
      expect(
        overlaps(boxes[i], {
          x,
          y,
          width: Math.max(...corners.map((point) => point.x)) - x,
          height: Math.max(...corners.map((point) => point.y)) - y,
        }),
      ).toBe(false);
    }
  }
  if (clock.frame / 30 >= scene.resolveAt) expect(host.textContent).toContain(scene.outcome);
  if (scene.counts)
    expect(host.textContent).toContain(
      `${scene.counts.starting} originals; ${scene.counts.retained} retained; ${scene.counts.arrivals} new`,
    );
  return boxes;
}

describe('cohort names at the rendered label/3D seam', () => {
  it.each(variants)('reserves readable slots in $layout $aspect / $text', (variant) => {
    for (const retained of [0, 3, BUSINESS_POPULATIONS_LIMITS.originalCustomers]) {
      for (const spaced of [false, true]) {
        const scene = sceneAtCapacity(retained, spaced);
        for (const actor of [...scene.members, ...scene.arrivals])
          expect(actor.label).toHaveLength(BUSINESS_POPULATIONS_LIMITS.actorLabel);
        const initial = checkLabels(scene, 0, variant);
        for (const t of [scene.actionAt, scene.responseAt, scene.checkAt, scene.resolveAt, 12])
          expect(checkLabels(scene, t, variant)).toEqual(initial);
      }
    }
  });

  it('retains the fixture identities and handles every smaller allowed actor count', () => {
    checkLabels(base, base.resolveAt);
    const max = sceneAtCapacity(3);
    for (
      let originals = 1;
      originals <= BUSINESS_POPULATIONS_LIMITS.originalCustomers;
      originals++
    ) {
      for (let arrivals = 0; arrivals <= BUSINESS_POPULATIONS_LIMITS.newCustomers; arrivals++) {
        const scene = {
          ...max,
          counts: undefined,
          members: max.members.slice(0, originals),
          arrivals: max.arrivals.slice(0, arrivals),
        };
        expect(checkLabels(scene, scene.resolveAt)).toEqual(checkLabels(scene, 0));
      }
    }
  });
});
