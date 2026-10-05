import { describe, expect, it } from 'vitest';
import {
  versionsPermissionsPages,
  versionsPermissionsPose,
  versionsPermissionsWrap,
} from './versions-permissions-poses';
import { versionsPermissionsCases } from './versions-permissions-test-fixtures';

describe('source-only versions and permissions seekable paging', () => {
  const cases = versionsPermissionsCases();
  it('real parser supplies all seven statuses and both modes', () => {
    expect(
      new Set(cases.flatMap((s) => [...s.records, ...s.relations].map((f) => f.status.state))),
    ).toEqual(
      new Set([
        'known',
        'conditional',
        'unknown',
        'missing',
        'disputed',
        'simulated',
        'illustrative',
      ]),
    );
    expect(new Set(cases.map((s) => s.visualMode))).toEqual(new Set(['diagram', 'hybrid']));
  });
  for (const [index, scene] of cases.entries()) {
    it(`source ${index}: every page reaches 30fps; repeat, shuffled, nonfinite and final holds`, () => {
      const pages = versionsPermissionsPages(scene),
        reached = new Set<number>();
      const times = Array.from(
        { length: Math.ceil((scene.resolveAt + 0.8) * 30) + 1 },
        (_, f) => f / 30,
      );
      const expected = times.map((t) => versionsPermissionsPose(scene, t));
      for (const p of expected) {
        reached.add(p.page);
        for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
          expect(p[key]).toBeGreaterThanOrEqual(0);
          expect(p[key]).toBeLessThanOrEqual(1);
        }
      }
      expect([...reached].sort((a, b) => a - b)).toEqual(pages.map((_, i) => i));
      for (let i = times.length - 1; i >= 0; i -= 7)
        expect(versionsPermissionsPose(scene, times[i])).toEqual(expected[i]);
      for (const t of [NaN, Infinity, -Infinity])
        expect(versionsPermissionsPose(scene, t)).toEqual(
          versionsPermissionsPose(scene, scene.setupAt),
        );
      expect(versionsPermissionsPose(scene, scene.resolveAt).page).toBe(pages.length - 1);
      expect(versionsPermissionsPose(scene, scene.resolveAt + 0.8 + 100).page).toBe(
        pages.length - 1,
      );
      for (const fact of [...scene.records, ...scene.relations]) {
        const supplied = pages
          .filter((p) => p.id === fact.id)
          .flatMap((p) => p.lines)
          .join('');
        for (const value of [
          fact.result,
          fact.scope,
          fact.period,
          fact.status.state,
          fact.version,
          fact.operation,
          'qualification' in fact.status ? fact.status.qualification : undefined,
          'condition' in fact.status ? fact.status.condition : undefined,
        ])
          if (value) expect(supplied).toContain(value);
      }
    });
  }
  it('wraps exact characters without truncating or ellipsis', () => {
    for (const s of [
      'unknown permissions remain unknown',
      'A'.repeat(54),
      'version one',
      'if the reviewer approves',
    ])
      expect(versionsPermissionsWrap(s).join('')).toBe(s);
  });
});
