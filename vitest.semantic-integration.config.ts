import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['electron/services/ai/semantic-analysis.integration.test.ts'],
    env: { SIEAR_SEMANTIC_INTEGRATION: 'true' },
    testTimeout: 60 * 60_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
})
