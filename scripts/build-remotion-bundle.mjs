#!/usr/bin/env node

import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { enableTailwind } from '@remotion/tailwind';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(projectRoot, 'out', 'remotion');
const publicDirectory = mkdtempSync(path.join(tmpdir(), 'batchclip-remotion-public-'));

function createWebpackOverride(currentConfig) {
  const withTailwind = enableTailwind(currentConfig, {
    configLocation: path.join(projectRoot, 'tailwind.config.js'),
  });

  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...(withTailwind.resolve?.alias ?? {}),
        '@': path.join(projectRoot, 'src', 'renderer', 'src'),
        '@shared': path.join(projectRoot, 'src', 'shared'),
      },
    },
  };
}

try {
  cpSync(path.join(projectRoot, 'resources', 'fonts'), path.join(publicDirectory, 'fonts'), {
    recursive: true,
  });

  await bundle({
    entryPoint: path.join(projectRoot, 'src', 'main', 'remotion', 'index.ts'),
    rootDir: projectRoot,
    outDir: outputDirectory,
    publicDir: publicDirectory,
    webpackOverride: createWebpackOverride,
    onProgress: () => undefined,
  });

  console.log(`Remotion browser bundle built at ${outputDirectory}`);
} finally {
  rmSync(publicDirectory, { recursive: true, force: true });
}
