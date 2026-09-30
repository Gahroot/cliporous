import { defineConfig, mergeConfig } from 'vitest/config';
import main from '../../vitest.config.main';

const config = mergeConfig(main, {
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 3_500_000,
    hookTimeout: 60_000,
  },
});
// mergeConfig concatenates arrays: replace include AFTER merging to exclude the regular suite.
export default defineConfig({
  ...config,
  test: { ...config.test, include: ['scripts/explainer-stills/systems-e2e.smoke.test.ts'] },
});
