import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReversibleExpiryDiagram } from './reversible-expiry-Diagram';
import { permissionText, reversibleExpiryPose, timingMarks } from './reversible-expiry-poses';
import {
  parseReversibleExpiryFixture,
  reversibleExpiryPacket,
  reversibleExpiryStressSeed,
  reversibleExpiryTestScenes,
} from './reversible-expiry-test-fixtures';

const scenes = reversibleExpiryTestScenes();
describe('real parser facts and finite frame seeking', () => {
  for (const [index, original] of scenes.entries())
    it(`case ${index}: every frame, shuffled/repeated seeks and source parity in both modes`, () => {
      const before = JSON.stringify(original);
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        const scene = { ...original, visualMode };
        const frames = Array.from({ length: 361 }, (_, frame) => frame / 30);
        const expected = frames.map((t) => reversibleExpiryPose(scene, t));
        for (let i = 0; i < frames.length; i++) {
          const j = (i * 97) % frames.length;
          expect(reversibleExpiryPose(scene, frames[j])).toEqual(expected[j]);
          expect(reversibleExpiryPose(scene, frames[j])).toEqual(expected[j]);
          const p = expected[j];
          for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const)
            expect(p[key]).toBeGreaterThanOrEqual(0);
          expect(p.marks).toEqual(timingMarks(scene));
        }
        for (const t of [NaN, Infinity, -Infinity])
          expect(reversibleExpiryPose(scene, t)).toEqual(
            reversibleExpiryPose(scene, scene.setupAt),
          );
        expect(reversibleExpiryPose(scene, scene.resolveAt + 100)).toEqual(
          reversibleExpiryPose(scene, scene.resolveAt + 1),
        );
        const pose = reversibleExpiryPose(scene, scene.setupAt);
        for (const r of [...scene.relations, scene.result])
          expect(
            pose.pages
              .filter((p) => p.id === r.id)
              .flatMap((p) => p.lines)
              .join(''),
          ).toContain(permissionText(r));
        for (const [page, p] of pose.pages.entries()) {
          const markup = renderToStaticMarkup(
            createElement(ReversibleExpiryDiagram, { scene, pose: { ...pose, page } }),
          );
          expect(markup).not.toMatch(/NaN|Infinity/);
          expect(markup).toBe(
            renderToStaticMarkup(
              createElement(ReversibleExpiryDiagram, {
                scene: { ...scene, visualMode: visualMode === 'hybrid' ? 'diagram' : 'hybrid' },
                pose: { ...pose, page },
              }),
            ),
          );
          if (scene.storyId === '43') {
            const r =
              scene.relations.find((relation) => relation.id === p.id) ?? scene.relations[0];
            expect(markup).toContain(`data-transition-id="${r.id}"`);
            expect(markup).toContain('data-execution="not-inferred"');
          }
          expect(markup).toContain(`Result: ${scene.result.state}`);
        }
      }
      expect(JSON.stringify(original)).toBe(before);
    });
  it('renders accepted equivalent endpoint qualifications without changing source labels', () => {
    const seed = reversibleExpiryStressSeed('44', 'conditional', true, false, true);
    const before = JSON.stringify(seed);
    const scene = parseReversibleExpiryFixture(seed);
    if (scene.storyId !== '44') throw new Error('Expected expiry');
    const validity = scene.records.find((r) => r.type === 'validity');
    if (
      !validity ||
      validity.representedStart.state !== 'conditional' ||
      validity.representedEnd.state !== 'conditional'
    )
      throw new Error('Expected conditional endpoints');
    expect(validity.representedStart.condition).toBe('if ready');
    expect(validity.representedEnd.condition).toBe('IF   READY');
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      const pose = reversibleExpiryPose(scene, scene.resolveAt);
      const markup = renderToStaticMarkup(
        createElement(ReversibleExpiryDiagram, { scene: { ...scene, visualMode }, pose }),
      );
      expect(markup).toContain('Supplied window');
      expect(markup).not.toContain('Unresolved window');
      expect(
        pose.pages
          .filter((p) => p.id === `${validity.id}:start`)
          .flatMap((p) => p.lines)
          .join(''),
      ).toContain('if ready');
      expect(
        pose.pages
          .filter((p) => p.id === `${validity.id}:end`)
          .flatMap((p) => p.lines)
          .join(''),
      ).toContain('IF   READY');
    }
    expect(JSON.stringify(seed)).toBe(before);
  });
  it('real maximum accepted records, identities and transitions', () => {
    const state = parseReversibleExpiryFixture(reversibleExpiryStressSeed('43'));
    expect([state.entities.length, state.records.length, state.relations.length]).toEqual([
      8, 11, 16,
    ]);
    const expiry = parseReversibleExpiryFixture(reversibleExpiryStressSeed('44', 'known', true));
    expect([expiry.entities.length, expiry.records.length, expiry.relations.length]).toEqual([
      8, 7, 6,
    ]);
    expect(timingMarks(expiry)).toHaveLength(8);
    const fractions = timingMarks(
      parseReversibleExpiryFixture(reversibleExpiryStressSeed('44', 'known', true, true)),
    );
    expect(fractions[0].x).toBe(40);
    expect(fractions[1].x).toBe(400);
    expect(fractions[2].x).toBe(40);
    for (const mark of fractions) {
      expect(mark.x).toBeGreaterThanOrEqual(40);
      expect(mark.x).toBeLessThanOrEqual(400);
    }
  });
  it('zero is a clock endpoint, unknown/missing/disputed are never zero; source results are independent', () => {
    for (const state of ['known', 'unknown', 'missing', 'disputed']) {
      const scene = parseReversibleExpiryFixture(reversibleExpiryStressSeed('44', state, true));
      const marks = timingMarks(scene);
      expect(marks[0].x).toBe(state === 'known' ? 40 : null);
      expect(marks[1].x).toBe(state === 'known' ? 400 : null);
      expect(scene.result.state).toBe('unknown');
    }
    const source = parseReversibleExpiryFixture(reversibleExpiryPacket.stories[1]);
    expect(source.relations[0].state).toBe('unknown');
    expect(source.result.state).toBe('denied');
  });
});
