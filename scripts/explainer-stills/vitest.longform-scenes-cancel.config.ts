import { defineConfig } from 'vitest/config';
import base from './vitest.longform-scenes.config';

/** Explicit media-only proof, never included by the default fast test suite. */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    testTimeout: 1_100_000,
    include: ['scripts/explainer-stills/longform-scenes-cancel.smoke.test.ts'],
  },
});
