import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    retry: 2,
    reporters: ['default'],
    coverage: {
      reporter: ['text']
    }
  }
})
