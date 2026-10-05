import { expect, it } from 'vitest';
import { regionPlacement, regionsDimensionsPose } from './regions-dimensions-poses';
import { accepted, cases, maximumDimension } from './regions-dimensions-test-fixtures';

for (const [index, scene] of cases().entries()) {
  it(`finite seekable five beats and actual source-page reachability ${index}`, () => {
    const frozen = JSON.stringify(scene);
    const seen = new Set<number>();
    const poses = Array.from({ length: 301 }, (_, frame) => {
      const pose = regionsDimensionsPose(scene, frame / 30);
      if (frame / 30 >= scene.setupAt && frame / 30 <= scene.resolveAt) seen.add(pose.page);
      for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
        expect(Number.isFinite(pose[key])).toBe(true);
        expect(pose[key]).toBeGreaterThanOrEqual(0);
        expect(pose[key]).toBeLessThanOrEqual(1);
      }
      return pose;
    });
    expect(seen.size).toBe(poses[0].pages.length);
    expect(poses[0].pages.length).toBeLessThanOrEqual(12);
    expect(new Set(poses[0].pages.map((p) => p.id)).size).toBe(poses[0].pages.length);
    for (const page of poses[0].pages) {
      expect(page.lines.length).toBeLessThanOrEqual(14);
      expect(page.lines.every((line) => Array.from(line).length <= 18)).toBe(true);
    }
    for (const frame of [300, 0, 176, 31, 240, 3, 100, 176])
      expect(regionsDimensionsPose(scene, frame / 30)).toEqual(poses[frame]);
    for (const t of [NaN, Infinity, -Infinity])
      expect(regionsDimensionsPose(scene, t)).toEqual(regionsDimensionsPose(scene, scene.setupAt));
    expect(regionsDimensionsPose(scene, 9.9)).toEqual(regionsDimensionsPose(scene, 10));
    expect(JSON.stringify(scene)).toBe(frozen);
    if (scene.storyId === '63') expect(regionPlacement(poses[300]).memberX).toBeNull();
  });
}

for (const template of ['line-length', 'square-area', 'cube-volume']) {
  it(`${template}: rejects unsupported negative physical operands rather than taking an absolute value`, () => {
    expect(() => accepted(maximumDimension(template, 'known', '-1/2', '1'))).toThrow();
    expect(() => accepted(maximumDimension(template, 'known', '1', '-1/2'))).toThrow();
  });
  it(`${template}: preserves exact source facts and derived operands across visual modes`, () => {
    const source = maximumDimension(template, 'known', '1', '999/1000');
    const { visualMode: diagramMode, ...diagram } = accepted(source, 'diagram');
    const { visualMode: hybridMode, ...hybrid } = accepted(source, 'hybrid');
    expect(diagramMode).toBe('diagram');
    expect(hybridMode).toBe('hybrid');
    expect(diagram).toEqual(hybrid);
  });
}
