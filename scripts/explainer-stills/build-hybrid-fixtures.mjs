#!/usr/bin/env node
/** Reproducible authored fixture compiler, using the installed build tool. Never loads a model-supplied module. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { normalizeFixtures } from './fixture-schema.mjs';
import { ROOT } from './harness-runtime.mjs';

const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
const compiled = await build({
  entryPoints: [path.join(ROOT, 'scripts/explainer-stills/hybrid-fixtures.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { hybridFixtureFiles } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
for (const [name, rows] of Object.entries(hybridFixtureFiles())) {
  if (!/^(?:detroit-landmarks|hybrid-(?:finance|business|ai|showcase|stress))\.json$/.test(name))
    throw new Error('Unexpected output fixture');
  normalizeFixtures(rows);
  const destination = path.join(ROOT, 'scripts/explainer-stills/fixtures', name);
  const serialized = `${JSON.stringify(rows, null, 2)}\n`;
  if (existsSync(destination)) {
    if (readFileSync(destination, 'utf8').replaceAll('\r\n', '\n') !== serialized)
      throw new Error(`Fixture changed; review before replacing ${name}`);
  } else if (values.check) throw new Error(`Missing fixture ${name}`);
  else writeFileSync(destination, serialized, { flag: 'wx' });
  console.log(`${values.check ? 'Verified' : 'Created/verified'} ${name}: ${rows.length} fixtures`);
}
