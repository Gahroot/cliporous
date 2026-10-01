import { defineConfig, mergeConfig } from 'vitest/config';
import main from '../../vitest.config.main';

const config = mergeConfig(main, {
  test: { fileParallelism: false, maxWorkers: 1, testTimeout: 19 * 60 * 1000, hookTimeout: 10_000 },
});
export default defineConfig({
  ...config,
  test: { ...config.test, include: ['scripts/planner-eval/saved-plan.render.ts'] },
});
