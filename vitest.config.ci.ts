import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    setupFiles: ['./test/utils/test-setup.ts'],
    coverage: {
      reporter: ['lcov', 'text'],
      exclude: ['node_modules/', 'dist/', 'test/', '**/*.test.ts', '**/*.spec.ts'],
    },
  },
})
