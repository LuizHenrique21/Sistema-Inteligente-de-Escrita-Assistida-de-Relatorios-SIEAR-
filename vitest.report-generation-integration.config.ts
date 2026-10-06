import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['electron/services/ai/report-generation.integration.test.ts'],
    env: { SIEAR_REPORT_GENERATION_INTEGRATION: 'true' },
    testTimeout: 30 * 60_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
})
