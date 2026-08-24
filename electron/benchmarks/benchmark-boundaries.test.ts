import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface PackageScripts {
  scripts?: Record<string, string>
}

describe('fronteira do benchmark real', () => {
  it('mantém o benchmark opt-in fora da suíte padrão', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as PackageScripts
    const baselineConfig = await readFile(
      new URL('../../vitest.baseline.config.ts', import.meta.url),
      'utf8',
    )
    const checkpointConfig = await readFile(
      new URL('../../vitest.checkpoint-benchmark.config.ts', import.meta.url),
      'utf8',
    )
    const cpuWorkerConfig = await readFile(
      new URL('../../vitest.cpu-worker-benchmark.config.ts', import.meta.url),
      'utf8',
    )

    expect(packageJson.scripts?.test).toBe('vitest run')
    expect(packageJson.scripts?.['benchmark:baseline']).toContain(
      'vitest.baseline.config.ts',
    )
    expect(packageJson.scripts?.['benchmark:checkpoint']).toContain(
      'vitest.checkpoint-benchmark.config.ts',
    )
    expect(packageJson.scripts?.['benchmark:workers']).toContain(
      'vitest.cpu-worker-benchmark.config.ts',
    )
    expect(baselineConfig).toContain(
      "include: ['electron/benchmarks/template-creation.baseline.ts']",
    )
    expect(checkpointConfig).toContain(
      "include: ['electron/benchmarks/checkpoint-resume.baseline.ts']",
    )
    expect(cpuWorkerConfig).toContain(
      "include: ['electron/benchmarks/cpu-worker.benchmark.ts']",
    )
    expect('template-creation.baseline.ts').not.toMatch(/\.(test|spec)\.[^.]+$/)
    expect('checkpoint-resume.baseline.ts').not.toMatch(
      /\.(test|spec)\.[^.]+$/,
    )
    expect('cpu-worker.benchmark.ts').not.toMatch(/\.(test|spec)\.[^.]+$/)
  })
})
