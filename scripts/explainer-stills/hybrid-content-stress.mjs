#!/usr/bin/env node
/** Layout-only, deliberately ungrounded probes. Never changes the source-backed fixture packs. */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeFixtures } from './fixture-schema.mjs';

export function hybridContentStress() {
  const packs = ['hybrid-finance', 'hybrid-business', 'hybrid-ai'];
  const selected = new Map();
  for (const pack of packs) {
    const rows = JSON.parse(
      readFileSync(new URL(`fixtures/${pack}.json`, import.meta.url), 'utf8'),
    );
    normalizeFixtures(rows);
    for (const row of rows) {
      const key =
        row.scene.kind === 'inference-tradeoff'
          ? `${row.scene.kind}-${row.scene.preset}`
          : row.scene.kind;
      if (!selected.has(key)) selected.set(key, row);
    }
  }
  const actor = (id) => ({ id, label: `${id.toUpperCase()}${'W'.repeat(28)}`.slice(0, 28) });
  return [...selected.values()].flatMap((row) => {
    const scene = structuredClone(row.scene);
    scene.label = 'Layout-only maximum content probe';
    switch (scene.kind) {
      case 'fund-flow':
        scene.sources = scene.sources.map((entry) => actor(entry.id));
        scene.targets = scene.targets.map((entry) => actor(entry.id));
        scene.account = actor(scene.account.id);
        break;
      case 'ownership-change':
        scene.holder = actor(scene.holder.id);
        break;
      case 'portfolio-exposure': {
        scene.funds = scene.funds.map((entry) => actor(entry.id));
        scene.exposure = actor(scene.exposure.id);
        scene.holdings = scene.funds.flatMap((fund) => [
          { fundId: fund.id, holding: scene.exposure },
          ...[1, 2].map((i) => ({ fundId: fund.id, holding: actor(`${fund.id}${i}`) })),
        ]);
        break;
      }
      case 'cash-timing':
        scene.paidWhen = `Today ${'W'.repeat(22)}`;
        scene.receivedWhen = `Later ${'W'.repeat(22)}`;
        break;
      case 'token-attention':
        scene.tokens = Array.from({ length: 12 }, (_, i) => ({
          id: `t${i}`,
          text: 'W'.repeat(i === 1 || i === 10 ? 16 : 8),
        }));
        scene.sentence = scene.tokens.map((token) => token.text).join(' ');
        scene.targetIndex = 10;
        scene.contextIndex = 1;
        break;
      case 'inference-tradeoff': {
        const third = actor('third');
        scene.models = [...scene.models.map((entry) => actor(entry.id)), third];
        scene.metrics = scene.metrics.map((metric) => ({
          ...metric,
          values: [...metric.values, { modelId: third.id, measurement: { state: 'unknown' } }],
        }));
        scene.task = 'W'.repeat(28);
        scene.basis = 'W'.repeat(28);
        break;
      }
      default:
        throw new Error('Unexpected stress kind');
    }
    return ['diagram', 'hybrid'].map((visualMode) => ({
      name: `content-stress-${scene.kind}${scene.kind === 'inference-tradeoff' ? `-${scene.preset}` : ''}-${visualMode}`,
      durationSec: row.durationSec,
      scene: { ...scene, visualMode },
      palette: row.palette,
      layout: 'stack',
      aspect: '9:16',
      covers: ['layout-only-unvalidated-maximum-content', scene.kind, visualMode],
      samples: [{ name: 'hold', frame: 282 }],
    }));
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const rows = hybridContentStress();
  normalizeFixtures(rows);
  const out = mkdtempSync(path.join(tmpdir(), 'hybrid-content-stress-'));
  const file = path.join(out, 'fixtures.json');
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, { flag: 'wx' });
  console.log(file);
}
