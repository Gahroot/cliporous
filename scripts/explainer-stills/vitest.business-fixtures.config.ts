import { defineConfig } from 'vitest/config';
import main from '../../vitest.config.main';
export default defineConfig({
  ...main,
  test: {
    ...main.test,
    include: [
      'scripts/explainer-stills/business-fixtures.test.ts',
      'scripts/explainer-stills/business-coverage.test.ts',
    ],
  },
});
