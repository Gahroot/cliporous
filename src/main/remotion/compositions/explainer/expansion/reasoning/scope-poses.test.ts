import { describe, expect, it } from 'vitest';
import { scopeDetails, scopePose } from './scope-poses';
import { maximumFactsScene, maximumScopeScene, scopeTestScenes } from './scope-poses.fixtures';

describe('scope source lenses', () => {
  it('accepts the real parser caps with reused named actors and more than five clauses', () => {
    const statements = maximumScopeScene();
    expect(statements.actors).toHaveLength(8);
    expect(statements.statements).toHaveLength(12);
    expect(statements.relations).toHaveLength(16);
    expect(new Set(statements.statements.map((s) => s.id)).size).toBe(12);
    for (const facts of [
      maximumFactsScene(),
      maximumFactsScene(true),
      maximumFactsScene(false, true),
    ]) {
      expect(facts.actors).toHaveLength(8);
      expect(facts.facts).toHaveLength(12);
      expect(facts.frames).toHaveLength(2);
      expect(facts.relations).toHaveLength(1);
      expect(new Set(facts.facts.map((f) => f.id)).size).toBe(12);
    }
    expect(new Set(maximumFactsScene(false, true).facts.map((f) => f.quantity.state))).toEqual(
      new Set([
        'known',
        'missing',
        'unknown',
        'disputed',
        'illustrative',
        'simulated',
        'conditional',
      ]),
    );
  });
  for (const scene of [
    ...scopeTestScenes,
    maximumScopeScene(),
    maximumScopeScene(true),
    maximumFactsScene(),
    maximumFactsScene(true),
    maximumFactsScene(false, true),
  ])
    it(`${scene.storyId}: all frames, seeks, detail identities and final hold`, () => {
      const original = JSON.stringify(scene);
      const frames = Array.from({ length: 361 }, (_, i) => scopePose(scene, i / 30));
      for (const i of [
        360,
        0,
        88,
        19,
        215,
        88,
        ...Array.from({ length: 361 }, (_, k) => 360 - k),
      ]) {
        const pose = scopePose(scene, i / 30);
        expect(pose).toEqual(frames[i]);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(pose[key]).toBeGreaterThanOrEqual(0);
          expect(pose[key]).toBeLessThanOrEqual(1);
        }
        expect(pose.page).toBeGreaterThanOrEqual(0);
        expect(pose.page).toBeLessThan(pose.pages.length);
        expect(Number.isFinite(pose.modelTurn)).toBe(true);
      }
      const ids =
        scene.storyId === '07' ? scene.statements.map((s) => s.id) : scene.facts.map((f) => f.id);
      const selected = new Set(frames.filter((p) => p.action > 0).map((p) => p.pages[p.page].id));
      // Every section, not merely each record's first section, occurs at a real 30fps frame.
      const sections = new Set(frames.filter((p) => p.action > 0).map((p) => p.page));
      scopeDetails(scene).forEach((_, index) => {
        expect(sections.has(index), `section ${index}`).toBe(true);
      });
      ids.forEach((id) => {
        expect(selected.has(id)).toBe(true);
      });
      expect(scopePose(scene, scene.resolveAt + 0.3)).toEqual(scopePose(scene, 100));
      expect(scopePose(scene, Number.NaN)).toEqual(scopePose(scene, scene.setupAt));
      expect(JSON.stringify(scene)).toBe(original);
      const text = scopeDetails(scene)
        .flatMap((p) => p.lines)
        .join(' ');
      const recordText = (id: string) =>
        scopeDetails(scene)
          .filter((p) => p.id === id)
          .flatMap((p) => p.lines)
          .join('');
      if (scene.storyId === '07')
        scene.statements.forEach((s) => {
          expect(text.replace(/\s/g, '')).toContain(s.claim.replace(/\s/g, ''));
          const detail = recordText(s.id);
          for (const field of [s.label, s.version, s.period, s.scope, s.claim, s.condition ?? ''])
            expect(detail).toContain(field);
          for (const id of [s.actorId, s.sourceId])
            expect(detail).toContain(`${id}: ${scene.actors.find((a) => a.id === id)?.label}`);
          expect(
            scopeDetails(scene)
              .filter((p) => p.id === s.id)
              .every((p) => p.marker.endsWith(s.status)),
          ).toBe(true);
        });
      else {
        expect(scene.frames[0].factIds).toEqual(scene.frames[1].factIds);
        scene.facts.forEach((f) => {
          const detail = recordText(f.id);
          const q = f.quantity;
          for (const field of [
            f.label,
            q.claim,
            q.actor,
            q.basis.unit,
            q.basis.period,
            q.basis.population,
          ])
            expect(detail).toContain(field);
          expect(
            scopeDetails(scene)
              .filter((p) => p.id === f.id)
              .every((p) => p.marker.endsWith(q.state)),
          ).toBe(true);
          if ('condition' in q) expect(detail).toContain(q.condition);
          if ('qualifier' in q) expect(detail).toContain(q.qualifier);
          if (q.state === 'disputed') {
            for (const alternative of q.alternatives)
              expect(detail).toContain(alternative.notation);
            expect(q).not.toHaveProperty('amount');
          }
          if (q.state === 'missing' || q.state === 'unknown') {
            expect(detail).toContain(`Amount: ${q.state}`);
            expect(q).not.toHaveProperty('amount');
            expect(detail).not.toMatch(/Amount: 0|derived/i);
          }
          if ('amount' in f.quantity)
            expect(text.replace(/\s/g, '')).toContain(f.quantity.amount.notation);
          else if (f.quantity.state === 'unknown') {
            expect(f.quantity).not.toHaveProperty('amount');
            const detail = scopeDetails(scene)
              .filter((p) => p.id === f.id)
              .flatMap((p) => p.lines)
              .join('')
              .replace(/\s/g, '');
            expect(detail).toContain('Amount:unknown');
            expect(detail).toContain(f.quantity.qualifier.replace(/\s/g, ''));
            expect(detail).not.toMatch(/Amount:0|false|derived/i);
          }
        });
        expect(text).not.toMatch(/derived|50%/);
        expect(scene).not.toHaveProperty('ratio');
        expect(scene).not.toHaveProperty('derived');
      }
    });
});
