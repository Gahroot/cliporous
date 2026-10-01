import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { FIXTURE_MANIFEST } from './fixture-manifest.mjs';
import {
  TECHNOLOGY_POSE_EXPORTS,
  verifyTechnologyPose,
  withTechnologyPoses,
} from './system-poses.mjs';
import { loadFixtures } from './verification-options.mjs';

const fixtures = loadFixtures(
  Object.keys(TECHNOLOGY_POSE_EXPORTS).map((kind) => `technology-${kind}.json`),
).fixtures;

test('actual five pose modules evaluate all fifteen complete timelines and exact boundaries', async (t) => {
  assert.deepEqual(
    fixtures.map((fx) => `${fx.scene.kind}/${fx.scene.preset}`).sort(),
    [...FIXTURE_MANIFEST.technology].sort(),
  );
  await withTechnologyPoses(async (poses, metadata) => {
    assert(metadata.sources.length >= 7);
    assert.match(metadata.sourceHash, /^[a-f0-9]{64}$/);
    for (const fixture of fixtures) {
      await t.test(fixture.name, () => {
        const result = verifyTechnologyPose(fixture, poses);
        assert.equal(result.allFrames, Math.round(fixture.durationSec * 30));
        assert.equal(result.boundaryBeats, 5);
        assert(result.repeatedSeeks >= result.allFrames * 2);
        assert(result.finalHoldSamples >= 24);
      });
    }
  });
});

test('pose checks reject missing exports, placeholders, nonfinite values, state and moving final holds', () => {
  const fixture = fixtures[0];
  const name = TECHNOLOGY_POSE_EXPORTS[fixture.scene.kind];
  assert.throws(() => verifyTechnologyPose(fixture, {}), /missing actual pose export/);
  assert.throws(() => verifyTechnologyPose(fixture, { [name]: () => ({}) }), /empty numeric/);
  assert.throws(() => verifyTechnologyPose(fixture, { [name]: () => ({ x: 1 }) }), /placeholder/);
  assert.throws(() => verifyTechnologyPose(fixture, { [name]: () => ({ x: NaN }) }), /non-finite/);
  assert.throws(
    () => verifyTechnologyPose(fixture, { [name]: (_scene, time) => ({ x: time }) }),
    /non-static/,
  );
  let counter = 0;
  assert.throws(
    () => verifyTechnologyPose(fixture, { [name]: () => ({ x: counter++ }) }),
    /nondeterministic/,
  );
  assert.throws(
    () =>
      verifyTechnologyPose({ ...fixture, scene: { ...fixture.scene, preset: 'cache-hit' } }, {}),
    /unknown technology/,
  );
});

test('owned temporary module is cleaned even when the callback fails', async () => {
  let owned;
  await assert.rejects(
    withTechnologyPoses((_poses, metadata) => {
      owned = path.dirname(metadata.temporaryModule);
      assert(existsSync(metadata.temporaryModule));
      throw new Error('callback failed');
    }),
    /callback failed/,
  );
  assert(owned);
  assert(!existsSync(owned));
});
