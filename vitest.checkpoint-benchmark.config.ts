import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['electron/benchmarks/checkpoint-resume.baseline.ts'],
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
})
