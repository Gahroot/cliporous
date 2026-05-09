import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/main/test-setup.ts'],
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'dist']
  }
})
