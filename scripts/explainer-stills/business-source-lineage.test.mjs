import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBusinessSourceUnchanged,
  captureBusinessLineage,
} from './business-source-lineage.mjs';

const plan = [{ covers: [{ category: 'recipe', id: 'OP-01' }] }];

test('business native reports bind the observed source and verified bundle', () => {
  const source = { sha256: 'source', files: { 'src/main/example.ts': 'bytes' } };
  const bundle = { path: '/owned/pin', sha256: 'bundle', sources: {} };
  const lineage = captureBusinessLineage(plan, bundle.path, {
    sourceEvidence: () => source,
    bundleEvidence: (path) => {
      assert.equal(path, bundle.path);
      return bundle;
    },
  });
  assert.deepEqual(lineage, { source, bundle });
  assertBusinessSourceUnchanged(lineage, () => source);
  assert.throws(
    () => assertBusinessSourceUnchanged(lineage, () => ({ sha256: 'mutated' })),
    /source changed/,
  );
});

test('source mutation during native lineage capture fails closed', () => {
  let reads = 0;
  assert.throws(
    () =>
      captureBusinessLineage(plan, '/owned/pin', {
        sourceEvidence: () => ({ sha256: ++reads === 1 ? 'before' : 'after' }),
        bundleEvidence: () => ({ path: '/owned/pin', sha256: 'bundle' }),
      }),
    /source changed/,
  );
});

test('legacy still/motion scope reads no extra assets and has unchanged report shape', () => {
  const forbidden = () => {
    throw new Error('unexpected reader');
  };
  assert.equal(
    captureBusinessLineage([{ covers: [{ category: 'kind', id: 'flow' }] }], '/legacy', {
      sourceEvidence: forbidden,
      bundleEvidence: forbidden,
    }),
    null,
  );
  assertBusinessSourceUnchanged(null, forbidden);
});
