/** Source-only technology pose checks. No browser, render, or production bundle changes. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { sceneBeats, targetMatchesScene } from './fixture-manifest.mjs';
import { digest, ROOT } from './harness-runtime.mjs';
import { shuffledSamples } from './verification-options.mjs';

export const TECHNOLOGY_POSE_EXPORTS = Object.freeze({
  'agent-workflow': 'agentWorkflowPose',
  'retrieval-grounding': 'retrievalGroundingPose',
  'context-window': 'contextWindowPose',
  'software-release': 'softwareReleasePose',
  'request-routing': 'requestRoutingPose',
});

/** Node 22 cannot follow these TS modules' extensionless imports. Compile only the pure pose graph. */
export async function withTechnologyPoses(operation) {
  const directory = mkdtempSync(path.join(tmpdir(), 'batchclip-system-poses-'));
  const output = path.join(directory, 'poses.mjs');
  try {
    const result = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: Object.entries(TECHNOLOGY_POSE_EXPORTS)
          .map(([kind, name]) => `export { ${name} } from './${kind}.ts';`)
          .join('\n'),
        resolveDir: path.join(ROOT, 'src/main/remotion/compositions/explainer/technology'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile: output,
      metafile: true,
      logLevel: 'silent',
    });
    const sources = Object.keys(result.metafile.inputs)
      .filter((file) => file !== '<stdin>')
      .sort()
      .map((file) => ({ path: file, sha256: digest(readFileSync(path.resolve(ROOT, file))) }));
    const metadata = {
      temporaryModule: output,
      sources,
      sourceHash: digest(sources),
      moduleHash: digest(readFileSync(output)),
    };
    return await operation(await import(pathToFileURL(output).href), metadata);
  } finally {
    rmSync(directory, { recursive: true, force: true }); // Only the directory created above.
  }
}

function finiteNumbers(value, label) {
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label}: non-finite pose`);
    return 1;
  }
  if (value && typeof value === 'object')
    return Object.entries(value).reduce(
      (n, [key, child]) => n + finiteNumbers(child, `${label}.${key}`),
      0,
    );
  assert(
    value === null || ['string', 'boolean'].includes(typeof value),
    `${label}: unsupported pose value`,
  );
  return 0;
}

/** Evaluate real exports at every 30fps frame, exact beat neighbours, shuffled/repeated seeks and final holds. */
export function verifyTechnologyPose(fixture, poses) {
  const { scene, durationSec } = fixture;
  const id = `${scene.kind}/${scene.preset}`;
  assert(
    targetMatchesScene({ category: 'technology', id }, scene),
    `${id}: unknown technology kind/preset`,
  );
  const exportName = TECHNOLOGY_POSE_EXPORTS[scene.kind];
  const pose = poses[exportName];
  assert.equal(typeof pose, 'function', `${exportName}: missing actual pose export`);
  const beats = sceneBeats(scene, durationSec);
  assert(durationSec - scene.resolveAt >= 0.8, `${id}: insufficient final hold`);
  const frameCount = Math.round(durationSec * 30);
  const times = new Set(Array.from({ length: frameCount }, (_, frame) => frame / 30));
  for (const { at } of beats)
    for (const delta of [-1 / 30, -1e-6, 0, 1e-6, 1 / 30]) times.add(at + delta);
  times.add(durationSec);
  times.add(durationSec + 2);
  const before = structuredClone(scene);
  const snapshots = new Map();
  for (const time of [...times].sort((a, b) => a - b)) {
    const result = pose(scene, time);
    assert(finiteNumbers(result, `${id}@${time}`) > 0, `${id}: empty numeric pose`);
    snapshots.set(time, structuredClone(result));
  }
  assert.notDeepEqual(
    snapshots.get(0),
    snapshots.get(scene.resolveAt),
    `${id}: constant placeholder pose`,
  );
  const seeks = shuffledSamples([...snapshots.keys()]);
  for (const time of [...seeks, ...seeks.toReversed()])
    assert.deepEqual(
      pose(scene, time),
      snapshots.get(time),
      `${id}@${time}: nondeterministic seek`,
    );
  const final = snapshots.get(scene.resolveAt);
  for (const [time, result] of snapshots)
    if (time >= scene.resolveAt)
      assert.deepEqual(result, final, `${id}@${time}: non-static final hold`);
  assert.deepEqual(scene, before, `${id}: pose mutated input`);
  return {
    status: 'passed',
    id,
    exportName,
    allFrames: frameCount,
    sampledTimes: snapshots.size,
    boundaryBeats: beats.length,
    repeatedSeeks: seeks.length * 2,
    finalHoldSamples: [...snapshots.keys()].filter((time) => time >= scene.resolveAt).length,
    limits:
      'Current-source numeric poses only; not rendered pixels, visual semantics, or bundle correspondence.',
  };
}
