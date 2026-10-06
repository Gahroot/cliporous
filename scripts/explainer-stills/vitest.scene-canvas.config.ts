import { defineConfig, mergeConfig } from 'vitest/config';
import main from '../../vitest.config.main';

const config = mergeConfig(main, {
  test: {
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 3_600_000,
    hookTimeout: 60_000,
  },
});
// Separate opt-in media proof, never part of the fast default test suite.
export default defineConfig({
  ...config,
  test: { ...config.test, include: ['scripts/explainer-stills/scene-canvas.proof.test.ts'] },
});
