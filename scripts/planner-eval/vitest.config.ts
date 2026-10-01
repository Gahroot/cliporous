import { defineConfig, mergeConfig } from 'vitest/config';
import main from '../../vitest.config.main';

const config = mergeConfig(main, {
  test: { fileParallelism: false, maxWorkers: 1, testTimeout: 110_000, hookTimeout: 10_000 },
});
export default defineConfig({
  ...config,
  test: { ...config.test, include: ['scripts/planner-eval/planner-eval.run.ts'] },
});
