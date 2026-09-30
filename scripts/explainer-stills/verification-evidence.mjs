import { existsSync, readFileSync } from 'node:fs';
import { FIXTURE_MANIFEST } from './fixture-manifest.mjs';
import { digest } from './harness-runtime.mjs';

export function pngEvidence(file, width, height) {
  const bytes = readFileSync(file);
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
  ) {
    throw new Error(`${file}: not a complete PNG`);
  }
  if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height)
    throw new Error(`${file}: non-native PNG dimensions`);
  return { sha256: digest(bytes), bytes: bytes.length };
}

export function artifactValid(entry) {
  try {
    return (
      entry.status === 'passed' &&
      entry.renderedFrames === 1 &&
      /^[a-f0-9]{64}$/.test(entry.inputHash ?? '') &&
      existsSync(entry.output) &&
      pngEvidence(entry.output, entry.width, entry.height).sha256 === entry.sha256
    );
  } catch {
    return false;
  }
}

/** A declaration is not evidence. Each required case/frame must have a still with the same props hash. */
export function executionCoverage(plans, reports = []) {
  const entries = reports
    .flatMap((r) => r.entries ?? [])
    .filter((e) => e.operation === 'still' && artifactValid(e));
  return Object.entries(FIXTURE_MANIFEST).flatMap(([category, ids]) =>
    ids.map((id) => {
      const relevant = plans.filter((p) =>
        p.covers.some((t) => t.category === category && t.id === id),
      );
      const cases = relevant.map((plan) => {
        const missingFrames = plan.samples.filter(
          (s) =>
            !entries.some(
              (e) =>
                e.inputHash === plan.inputHash &&
                e.frame === s.frame &&
                e.width === plan.composition.width &&
                e.height === plan.composition.height,
            ),
        );
        return {
          id: plan.id,
          fixture: plan.fixtureName,
          aspect: plan.inputProps.aspect,
          layout: plan.inputProps.layout,
          requiredFrames: plan.samples.length,
          verifiedFrames: plan.samples.length - missingFrames.length,
          missingFrames: missingFrames.map((s) => s.frame),
        };
      });
      return {
        category,
        id,
        declared: relevant.length > 0,
        cases,
        criticalFramesExecuted:
          cases.length > 0 && cases.every((c) => c.missingFrames.length === 0),
      };
    }),
  );
}

/** Exact local byte regression; changed/missing artifacts fail, not 'close enough'. */
export function compareStillReports(before, after) {
  const key = (e) => `${e.inputHash}:${e.frame}`;
  const old = (before.entries ?? []).filter((e) => e.operation === 'still');
  const fresh = (after.entries ?? []).filter((e) => e.operation === 'still');
  const rows = old.map((entry) => {
    const candidate = fresh.find((other) => key(other) === key(entry));
    return {
      key: key(entry),
      before: entry.output,
      after: candidate?.output ?? null,
      equal:
        artifactValid(entry) &&
        !!candidate &&
        artifactValid(candidate) &&
        candidate.sha256 === entry.sha256,
    };
  });
  return {
    checks: rows,
    rendererConfigurationsMatch:
      before.rendererConfigurationHash && after.rendererConfigurationHash
        ? before.rendererConfigurationHash === after.rendererConfigurationHash
        : null,
    equal:
      before.status === 'passed' &&
      after.status === 'passed' &&
      rows.length > 0 &&
      rows.every((r) => r.equal),
    note: 'Exact bytes for matching input hashes/frames on recorded environments, not a cross-platform perceptual threshold.',
  };
}

export function alphaStats(bytes) {
  if (!bytes.length) throw new Error('Empty alpha plane');
  let min = 255;
  let max = 0;
  let transparentPixels = 0;
  let opaquePixels = 0;
  let partialPixels = 0;
  for (const value of bytes) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (value === 0) transparentPixels++;
    else if (value === 255) opaquePixels++;
    else partialPixels++;
  }
  return {
    min,
    max,
    transparentPixels,
    opaquePixels,
    partialPixels,
    hasTransparentAndVisible: min === 0 && max > 0,
  };
}

export function compareCosts(candidate, control) {
  const fields = [
    'rendererConfigurationHash',
    'width',
    'height',
    'fps',
    'codec',
    'renderedFrames',
    'requestedFrames',
    'paletteHash',
    'concurrency',
  ];
  const matched =
    candidate.status === 'passed' &&
    control.status === 'passed' &&
    fields.every((key) => candidate[key] !== undefined && candidate[key] === control[key]) &&
    candidate.concurrency === 1 &&
    candidate.renderedFrames > 0 &&
    candidate.renderedFrames === candidate.requestedFrames &&
    Number.isFinite(candidate.msPerRenderedSecond) &&
    candidate.msPerRenderedSecond >= 0 &&
    Number.isFinite(control.msPerRenderedSecond) &&
    control.msPerRenderedSecond > 0;
  return {
    matched,
    candidateMsPerRenderedSecond: candidate.msPerRenderedSecond,
    controlMsPerRenderedSecond: control.msPerRenderedSecond,
    ratio: matched ? candidate.msPerRenderedSecond / control.msPerRenderedSecond : null,
    note: 'Same renderer configuration/flags, process/device, dimensions, palette, codec, frame count, concurrency=1. Includes render/encode startup; short windows are not full-movie throughput.',
  };
}
