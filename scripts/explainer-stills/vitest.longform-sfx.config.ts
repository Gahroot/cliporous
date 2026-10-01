import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    include: ['scripts/explainer-stills/longform-scenes-sfx.smoke.test.ts'],
    testTimeout: 20 * 60_000,
    hookTimeout: 30_000,
    maxWorkers: 1,
  },
});
