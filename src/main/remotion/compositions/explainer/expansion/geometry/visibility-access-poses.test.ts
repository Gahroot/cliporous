import { expect, it } from 'vitest';
import { visibilityAccessPages, visibilityAccessPose } from './visibility-access-poses';
import { accepted, sources } from './visibility-access-test-fixtures';

for (const [index, source] of sources.entries())
  it(`accepted source ${index}: all pages reachable at real 30fps; pure finite five beats and holds`, () => {
    const scene = accepted(source);
    const before = JSON.stringify(scene);
    const pages = visibilityAccessPages(scene);
    const visited = new Set<number>();
    for (let frame = 0; frame / 30 <= source.window.endTime; frame++)
      visited.add(visibilityAccessPose(scene, frame / 30, pages).page);
    expect(visited.size).toBe(pages.length);
    const times = [
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.resolveAt,
      source.window.endTime,
      0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    const poses = times.map((t) => visibilityAccessPose(scene, t, pages));
    for (const i of [8, 3, 0, 7, 6, 2, 9, 5, 4, 1, 3, 0]) {
      const pose = visibilityAccessPose(scene, times[i], pages);
      expect(pose).toEqual(poses[i]);
      for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
        expect(Number.isFinite(pose[key])).toBe(true);
        expect(pose[key]).toBeGreaterThanOrEqual(0);
        expect(pose[key]).toBeLessThanOrEqual(1);
      }
    }
    expect(visibilityAccessPose(scene, source.window.endTime + 100, pages)).toEqual(
      visibilityAccessPose(scene, source.window.endTime, pages),
    );
    expect(JSON.stringify(scene)).toBe(before);
    const joined = pages.flatMap((p) => p.lines).join('');
    for (const e of scene.entities) expect(joined).toContain(e.label);
    for (const f of [...scene.records, ...scene.relations])
      expect(pages.some((p) => p.sourceIds.includes(f.id))).toBe(true);
    expect(visibilityAccessPages(accepted(source, 'hybrid'))).toEqual(pages);
  });
