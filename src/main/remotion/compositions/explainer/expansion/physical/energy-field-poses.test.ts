import { expect, it } from 'vitest';
import { energyFieldPages, energyFieldPose, energyFieldWrap } from './energy-field-poses';
import { energyFieldFixtureScenes } from './energy-field-test-fixtures';

for (const [index, scene] of energyFieldFixtureScenes().entries()) {
  it(`retains exact source text and reaches every page at actual 30fps: ${index}/${scene.storyId}/${scene.visualMode}`, () => {
    const pages = energyFieldPages(scene),
      reached = new Set<number>();
    for (
      let frame = Math.ceil(scene.setupAt * 30);
      frame <= Math.floor(scene.resolveAt * 30);
      frame++
    )
      reached.add(energyFieldPose(scene, frame / 30).page);
    expect([...reached].sort((a, b) => a - b)).toEqual(pages.map((_, i) => i));
    for (const source of Object.values(scene.sourceSpans))
      expect(energyFieldWrap(source).join('')).toBe(source);
    for (const r of scene.records)
      for (const p of pages.filter((v) => v.recordId === r.id)) {
        expect(p.state).toBe(r.quantity.state);
        if ('condition' in r.quantity)
          expect(p.qualification.join('')).toContain(r.quantity.condition);
        if ('qualifier' in r.quantity)
          expect(p.qualification.join('')).toContain(r.quantity.qualifier);
      }
  });
  it(`is seekable, finite on nonfinite inputs and stable at final hold: ${index}/${scene.storyId}/${scene.visualMode}`, () => {
    const times = [
      scene.resolveAt,
      scene.setupAt,
      scene.actionAt,
      scene.responseAt,
      scene.checkAt,
      scene.setupAt - 1,
      scene.resolveAt + 1,
    ];
    const baseline = times.map((t) => energyFieldPose(scene, t));
    for (const i of [5, 2, 0, 6, 1, 4, 3, 0])
      expect(energyFieldPose(scene, times[i])).toEqual(baseline[i]);
    for (const t of [NaN, Infinity, -Infinity])
      expect(energyFieldPose(scene, t)).toEqual(energyFieldPose(scene, scene.setupAt));
    expect(energyFieldPose(scene, scene.resolveAt + 1).page).toBe(
      energyFieldPages(scene).length - 1,
    );
    for (const arrow of energyFieldPose(scene, scene.resolveAt).arrows)
      for (const n of [arrow.x, arrow.y, arrow.dx, arrow.dy]) expect(Number.isFinite(n)).toBe(true);
  });
}
