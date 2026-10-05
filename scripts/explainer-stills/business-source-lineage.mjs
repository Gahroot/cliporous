import assert from 'node:assert/strict';
import { bundleEvidence, sourceEvidence } from '../storyboard-proof/gates.mjs';

/** Only the additive business scope changes the legacy still/motion report. */
export function captureBusinessLineage(
  plan,
  bundlePath,
  readers = { sourceEvidence, bundleEvidence },
) {
  const business = plan.some((entry) =>
    entry.covers?.some((target) =>
      ['recipe', 'asset', 'motion', 'sequence'].includes(target.category),
    ),
  );
  if (!business) return null;
  const source = readers.sourceEvidence();
  const bundle = readers.bundleEvidence(bundlePath);
  assert.equal(
    readers.sourceEvidence().sha256,
    source.sha256,
    'Production source changed during lineage capture',
  );
  return { source, bundle };
}

export function assertBusinessSourceUnchanged(lineage, readSource = sourceEvidence) {
  if (lineage)
    assert.equal(
      readSource().sha256,
      lineage.source.sha256,
      'Production source changed during native verification',
    );
}
