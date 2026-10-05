import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, expect, it } from 'vitest';
import { PALETTES } from '../storyboard-proof/fixtures';
import {
  artifactPath,
  fileSha256,
  pngArtifact,
  probeArtifact,
  validateVideoProbe,
} from './business-artifacts.mjs';
import {
  assertBusinessExpectations,
  auditBusinessEvidence,
  sequenceSourceIdentity,
} from './business-coverage.mjs';
import { createBusinessFixtures, createBusinessSequenceExpectations } from './business-fixtures';
import { FIXTURE_MANIFEST, verificationPlan } from './fixture-manifest.mjs';
import { bundleDigest } from './harness-runtime.mjs';
import { executionCoverage } from './verification-evidence.mjs';

const owned = mkdtempSync(path.join(tmpdir(), 'business-artifact-unit-'));
afterAll(() => rmSync(owned, { recursive: true, force: true }));
const expected = {
  fixtures: createBusinessFixtures(),
  sequences: createBusinessSequenceExpectations(),
  palettes: PALETTES.map((p) => p.id),
  paths: [],
};
const plans = verificationPlan(expected.fixtures, { matrix: false, scope: 'business' });
const lineage = {
  source: { sha256: 'a'.repeat(64) },
  bundle: { path: '/external/pin', sha256: 'b'.repeat(64) },
};
const report = (patch: Record<string, unknown> = {}) => ({
  path: path.join(owned, 'report.json'),
  data: { schemaVersion: 1, status: 'passed', ...lineage, entries: [], ...patch },
});

function chunk(type: string, bytes: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const value of body) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const p = plans[0];
const image = path.join(owned, 'synthetic-unit.png');
writeFileSync(image, png(p.composition.width, p.composition.height));
const entry = {
  operation: 'still',
  status: 'passed',
  planId: p.id,
  inputHash: p.inputHash,
  scene: p.inputProps.scene,
  frame: 0,
  renderedFrames: 1,
  fps: 30,
  width: p.composition.width,
  height: p.composition.height,
  output: image,
  sha256: fileSha256(image),
};

it('retains the actual 152 modes, 80 recipes, 16 assets, 12 treatments and all native source windows', () => {
  expect(plans).toHaveLength(152 * 14);
  expect(
    new Set(
      expected.fixtures.flatMap((f) =>
        f.covers.filter((c) => c.category === 'recipe').map((c) => c.id),
      ),
    ).size,
  ).toBe(80);
  for (const [category, count] of [
    ['asset', 16],
    ['motion', 12],
  ] as const)
    expect(
      new Set(
        expected.fixtures.flatMap((f) =>
          f.covers.filter((c) => c.category === category).map((c) => c.id),
        ),
      ).size,
    ).toBe(count);
  expect(expected.sequences).toHaveLength(8);
  expect(expected.sequences.length * 2 * expected.palettes.length).toBe(160);
});

it('declarations and synthetic unit PNGs never establish completeness or full motion', () => {
  const result = auditBusinessEvidence(expected, [report({ entries: [entry] })], lineage);
  expect(result.complete).toBe(false);
  expect(result.motion.every((m: { fullMotionExecuted: boolean }) => !m.fullMotionExecuted)).toBe(
    true,
  );
  expect(
    result.sequences.every((s: { savedMediaExecuted: boolean }) => !s.savedMediaExecuted),
  ).toBe(true);
  expect(result.targets.filter((t) => t.criticalFramesExecuted)).toHaveLength(0);
  expect(result.rejectedReports).toHaveLength(0);
});

it('keeps no-scope global manifest distinct and complete against all its existing targets', () => {
  const global = executionCoverage([], []);
  expect(global).toHaveLength(Object.values(FIXTURE_MANIFEST).flat().length);
  expect(global.every((t) => !t.criticalFramesExecuted)).toBe(true);
  expect(global.some((t) => t.category === 'recipe')).toBe(false);
});

it.each([
  'mode',
  'recipe',
  'layout',
  'palette',
  'sequence',
  'sequence-palette',
])('fails closed for missing %s requirements', (missing) => {
  const bad = structuredClone(expected);
  if (missing === 'mode' || missing === 'recipe') bad.fixtures.pop();
  if (missing === 'layout' || missing === 'palette') bad.fixtures[0].cases.pop();
  if (missing === 'sequence') bad.sequences.pop();
  if (missing === 'sequence-palette') bad.palettes.pop();
  expect(() => assertBusinessExpectations(bad)).toThrow();
});

it.each([
  'asset',
  'motion',
])('missing %s declarations cannot satisfy the target matrix', (category) => {
  const bad = structuredClone(expected);
  for (const f of bad.fixtures) f.covers = f.covers.filter((c) => c.category !== category);
  const result = auditBusinessEvidence(bad, [], lineage);
  expect(result.complete).toBe(false);
  expect(result.targets.filter((t) => t.category === category).every((t) => !t.declared)).toBe(
    true,
  );
});

it.each([
  { schemaVersion: 2 },
  { mode: 'unit' },
  { status: 'unit' },
  { status: 'failed' },
  { unit: true },
  { unitOnly: true },
  { dryRun: true },
  { source: { sha256: 'c'.repeat(64) } },
  { bundle: { ...lineage.bundle, sha256: 'c'.repeat(64) } },
  { bundle: { ...lineage.bundle, path: '/copied/pin' } },
  { entries: {} },
  { businessSequences: [null] },
])('rejects schema/status/unit/lineage corruption %j', (patch) => {
  const result = auditBusinessEvidence(expected, [report(patch)], lineage);
  expect(result.complete).toBe(false);
  expect(result.rejectedReports).toHaveLength(1);
});

it.each([
  { output: path.join(owned, 'missing.png') },
  { sha256: 'c'.repeat(64) },
  { inputHash: 'c'.repeat(64) },
  { renderedFrames: 0 },
  { frame: -1 },
  { width: 1 },
  { fps: 24 },
  { status: 'unit' },
  { scene: {} },
])('rejects missing/tampered/copied/non-native still evidence %j', (patch) => {
  const result = auditBusinessEvidence(
    expected,
    [report({ entries: [{ ...entry, ...patch }] })],
    lineage,
  );
  expect(result.rejectedReports).toHaveLength(1);
  expect(result.complete).toBe(false);
});

it('rejects one PNG path relabeled as another frame/input', () => {
  const frame = p.samples.find((s: { frame: number }) => s.frame !== 0);
  if (!frame) throw new Error('Missing critical boundary');
  const result = auditBusinessEvidence(
    expected,
    [report({ entries: [entry, { ...entry, frame: frame.frame }] })],
    lineage,
  );
  expect(result.rejectedReports).toHaveLength(1);
});

it('checks actual PNG pixels/CRC, not a fabricated header or declared dimensions', () => {
  expect(() => pngArtifact(entry, owned, p.composition)).not.toThrow();
  const broken = path.join(owned, 'broken.png');
  const bytes = png(p.composition.width, p.composition.height);
  bytes[bytes.length - 20] ^= 1;
  writeFileSync(broken, bytes);
  expect(() =>
    pngArtifact({ ...entry, output: broken, sha256: fileSha256(broken) }, owned, p.composition),
  ).toThrow();
  expect(() => pngArtifact(entry, owned, { width: 1, height: 1 })).toThrow();
});

it('contains paths including symlink escapes and rejects URLs/directories', () => {
  const inner = path.join(owned, 'inner');
  symlinkSync(path.join(process.cwd(), 'package.json'), inner);
  for (const value of ['https://example.invalid/a.png', '../outside.png', owned, inner])
    expect(() => artifactPath(value, owned)).toThrow();
});

const native = { width: 1920, height: 1080, frames: 90, alpha: true };
const video = {
  codec_type: 'video',
  width: 1920,
  height: 1080,
  r_frame_rate: '30/1',
  avg_frame_rate: '30/1',
  nb_read_frames: '90',
  duration: '3',
  codec_name: 'prores',
  profile: '4444',
  pix_fmt: 'yuva444p10le',
};
it.each([
  { width: 1080 },
  { height: 1920 },
  { r_frame_rate: '24/1' },
  { avg_frame_rate: '30000/1001' },
  { nb_read_frames: '89' },
  { nb_read_frames: 'NaN' },
  { duration: '2' },
  { codec_name: 'h264' },
  { pix_fmt: 'yuv420p' },
])('rejects wrong native media probe %j', (patch) => {
  expect(() => validateVideoProbe({ streams: [{ ...video, ...patch }] }, native)).toThrow();
});
it('validates probe fields without claiming that a synthetic probe is executed media', () => {
  expect(validateVideoProbe({ streams: [video] }, native).frames).toBe(90);
  expect(() =>
    probeArtifact(
      { path: 'missing.mov', sha256: 'a'.repeat(64), probe: { streams: [video] } },
      owned,
      native,
    ),
  ).toThrow();
  expect(() =>
    probeArtifact(
      { path: image, sha256: 'a'.repeat(64), probe: { streams: [video] } },
      owned,
      native,
    ),
  ).toThrow();
});

function sourceRow(tag: string) {
  const s = expected.sequences[0];
  const approved = path.join(owned, `${tag}-approved.json`);
  const savedPath = path.join(owned, `${tag}-saved.json`);
  const original = { spec: s.spec, words: s.words, duration: s.sourceDuration };
  const plan = {
    schemaVersion: 2,
    parserVersion: 3,
    mode: 'scene-first',
    storyboardStyle: 'ink',
    sourceFingerprint: s.sourceFingerprint,
    sourceDuration: s.sourceDuration,
    scenes: [
      { kind: 'storyboard', sourceSpec: s.spec, startTime: s.startTime, endTime: s.endTime },
    ],
  };
  writeFileSync(approved, `${JSON.stringify(original, null, 2)}\n`);
  writeFileSync(savedPath, `${JSON.stringify(plan, null, 2)}\n`);
  const source = path.join(owned, `${tag}-source.mp4`);
  const preview = path.join(owned, `${tag}-preview.mp4`);
  const exported = path.join(owned, `${tag}-export.mp4`);
  // Deliberate unit bytes. Identity-only checks cannot turn these into media proof.
  writeFileSync(source, 'unit-source');
  writeFileSync(preview, 'unit-preview');
  writeFileSync(exported, 'unit-export');
  const row = {
    id: s.id,
    style: 'ink',
    palette: expected.palettes[0],
    parserVersion: 3,
    specVersion: 2,
    approvedSourcePath: approved,
    approvedSourceFileSha256: fileSha256(approved),
    approvedSourceSha256: s.approvedSourceSha256,
    savedPlanPath: savedPath,
    savedPlanSha256: fileSha256(savedPath),
    source: { path: source, sha256: fileSha256(source), duration: s.sourceDuration },
    previewWindow: { startFrame: 0, endFrame: s.previewFrames },
    preview: {
      path: preview,
      sha256: fileSha256(preview),
      route: 'renderLongformScenePreview',
      fullDecodeVerified: true,
      expectedFrames: s.previewFrames,
    },
    export: {
      path: exported,
      sha256: fileSha256(exported),
      route: 'renderSceneFirstLongform',
      fullDecodeVerified: true,
      expectedFrames: s.exportFrames,
      reconciliation: { fallbacks: [], scenes: { rendered: 1 } },
    },
  };
  return { row, original, plan, s };
}

it('matches the actual canonical producer source/saved-plan receipts without treating unit bytes as media', () => {
  const { row, s } = sourceRow('valid');
  expect(() => sequenceSourceIdentity(row, owned, s)).not.toThrow();
  expect(s.previewFrames).toBeLessThan(s.exportFrames);
});

it.each([
  'source-bytes',
  'noncanonical',
  'words',
  'duration',
  'spec',
  'saved-bytes',
  'parser',
  'style',
  'fingerprint',
  'scene-spec',
  'scene-window',
  'source-duration',
])('rejects canonical source/saved-plan identity corruption: %s', (kind) => {
  const { row, original, plan, s } = sourceRow(kind);
  if (kind === 'source-bytes') row.approvedSourceFileSha256 = 'c'.repeat(64);
  if (kind === 'saved-bytes') row.savedPlanSha256 = 'c'.repeat(64);
  if (kind === 'parser') plan.parserVersion = 2;
  if (kind === 'style') plan.storyboardStyle = 'polish';
  if (kind === 'fingerprint') plan.sourceFingerprint = 'wrong';
  if (kind === 'scene-window') plan.scenes[0].endTime += 1;
  if (kind === 'scene-spec')
    plan.scenes[0].sourceSpec = { ...s.spec, subject: { ...s.spec.subject, text: 'Unsupported' } };
  if (kind === 'source-duration') row.source.duration += 1;
  if (kind === 'words') original.words = original.words.slice(1);
  if (kind === 'duration') original.duration += 1;
  if (kind === 'spec')
    original.spec = { ...s.spec, subject: { ...s.spec.subject, text: 'Unsupported' } };
  if (['words', 'duration', 'spec', 'noncanonical'].includes(kind)) {
    writeFileSync(
      row.approvedSourcePath,
      kind === 'noncanonical' ? JSON.stringify(original) : `${JSON.stringify(original, null, 2)}\n`,
    );
    row.approvedSourceFileSha256 = fileSha256(row.approvedSourcePath);
  }
  if (['parser', 'style', 'fingerprint', 'scene-window', 'scene-spec'].includes(kind)) {
    writeFileSync(row.savedPlanPath, `${JSON.stringify(plan, null, 2)}\n`);
    row.savedPlanSha256 = fileSha256(row.savedPlanPath);
  }
  expect(() => sequenceSourceIdentity(row, owned, s)).toThrow();
});

it.each([
  'copied-path',
  'copied-bytes',
  'source-copy',
  'preview-full-source',
  'export-preview-only',
  'route',
  'decode-marker',
  'fallback',
  'missing-media',
])('rejects copied/incomplete/missing saved media receipts: %s', (kind) => {
  const { row, s } = sourceRow(kind);
  if (kind === 'copied-path') row.export.path = row.preview.path;
  if (kind === 'copied-bytes') row.export.sha256 = row.preview.sha256;
  if (kind === 'source-copy') row.preview.path = row.source.path;
  if (kind === 'preview-full-source') row.preview.expectedFrames = s.exportFrames;
  if (kind === 'export-preview-only') row.export.expectedFrames = s.previewFrames;
  if (kind === 'route') row.preview.route = 'prototype';
  if (kind === 'decode-marker') row.preview.fullDecodeVerified = false;
  if (kind === 'fallback') row.export.reconciliation.scenes.rendered = 0;
  if (kind === 'missing-media') row.preview.path = path.join(owned, 'absent.mp4');
  expect(() => sequenceSourceIdentity(row, owned, s)).toThrow();
});

it('accepts separately owned immutable copies only with the same actual bundle bytes', () => {
  const original = path.join(owned, 'lineage-original');
  const copied = path.join(owned, 'lineage-copy');
  for (const directory of [original, copied]) {
    mkdirSync(directory);
    writeFileSync(path.join(directory, 'index.html'), '<html>Local fixture bundle</html>');
    writeFileSync(path.join(directory, 'bundle.js'), 'const fixture = 1;');
  }
  const bundle = { path: original, sha256: bundleDigest(original) };
  const receipt = report({ bundle: { path: copied, sha256: bundle.sha256 } });
  const accepted = auditBusinessEvidence(expected, [receipt], { source: lineage.source, bundle });
  expect(accepted.rejectedReports).toEqual([]);
  expect(accepted.complete).toBe(false);
  writeFileSync(path.join(copied, 'bundle.js'), 'const fixture = 2;');
  const rejected = auditBusinessEvidence(expected, [receipt], { source: lineage.source, bundle });
  expect(rejected.rejectedReports).toHaveLength(1);
  expect(rejected.rejectedReports[0].reason).toContain('Bundle copy lineage mismatch');
});
