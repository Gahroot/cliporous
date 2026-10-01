#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.argv.length !== 3) {
  console.error(
    'Usage: node scripts/explainer-stills/verify-longform-sfx.mjs <completed-proof-directory>',
  );
  process.exitCode = 1;
} else {
  const out = mkdtempSync(join(tmpdir(), 'longform-sfx-proof-'));
  console.log(`SFX_PROOF_OUT ${out}`);
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'scripts/explainer-stills/vitest.longform-sfx.config.ts',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: 25 * 60_000,
      windowsHide: true,
      env: { ...process.env, LONGFORM_SFX_SOURCE: resolve(process.argv[2]), LONGFORM_SFX_OUT: out },
    },
  );
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
