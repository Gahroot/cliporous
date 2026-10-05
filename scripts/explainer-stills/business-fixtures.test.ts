import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { BUSINESS_RECIPES } from '../../src/main/remotion/compositions/explainer/business/catalog';
import { storyboardSourceInputBudget } from '../../src/shared/storyboards';
import { PALETTES } from '../storyboard-proof/fixtures';
import { createBusinessFixtures, createBusinessSequenceExpectations } from './business-fixtures';
import { verificationPlan } from './fixture-manifest.mjs';
import { normalizeFixtures } from './fixture-schema.mjs';

it('generates every declared mode through the real source parser in bounded native batches', () => {
  const fixtures = createBusinessFixtures();
  const sequences = createBusinessSequenceExpectations();
  expect(fixtures).toHaveLength(152);
  expect(sequences).toHaveLength(8);
  expect(sequences.every((s) => s.previewFrames > 0 && s.previewFrames < s.exportFrames)).toBe(
    true,
  );
  expect(sequences.every((s) => storyboardSourceInputBudget(s.spec))).toBe(true);
  for (let i = 0; i < fixtures.length; i += 16) {
    const batch = fixtures.slice(i, i + 16);
    const bytes = JSON.stringify(batch);
    expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(16 * 1024 * 1024);
    const restored = JSON.parse(bytes);
    expect(restored.map((f: { source: unknown }) => f.source)).toEqual(batch.map((f) => f.source));
    expect(normalizeFixtures(restored)).toHaveLength(batch.length);
    const native = verificationPlan(restored, { matrix: false, scope: 'business' });
    expect(native).toHaveLength(batch.length * 14);
    expect(
      native.every(
        (p: { composition: { width: number; height: number; fps: number } }) =>
          p.composition.fps === 30 && p.composition.width >= 1080 && p.composition.height >= 540,
      ),
    ).toBe(true);
  }
  expect(fixtures.length).toBe(BUSINESS_RECIPES.reduce((n, r) => n + r.modes.length, 0));
  expect(fixtures.every((f) => f.cases.length === 14 && f.source.words.length > 0)).toBe(true);
  // Generation is not execution evidence. Writes only to a newly owned external directory.
  if (process.env.BUSINESS_WRITE_FIXTURES === '1') {
    const out = mkdtempSync(path.join(tmpdir(), 'batchclip-business-fixtures-'));
    const files: string[] = [];
    for (let i = 0; i < fixtures.length; i += 16) {
      const file = path.join(out, `batch-${String(i / 16).padStart(2, '0')}.json`);
      writeFileSync(file, `${JSON.stringify(fixtures.slice(i, i + 16), null, 2)}\n`, {
        flag: 'wx',
      });
      files.push(file);
    }
    console.log(`Business source fixtures: ${out}`);
    writeFileSync(
      path.join(out, 'manifest.json'),
      `${JSON.stringify({ fixtureFiles: files, palettes: PALETTES.map((p) => p.id), sequences }, null, 2)}\n`,
      { flag: 'wx' },
    );
  }
});
