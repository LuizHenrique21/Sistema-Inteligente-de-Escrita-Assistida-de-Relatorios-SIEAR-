import { afterEach, describe, expect, it } from 'vitest'
import { resolveCpuWorkerPolicy } from './cpu-worker-policy'

describe('CpuWorkerPolicy', () => {
  const original = {
    extraction: process.env.SIEAR_DOCX_WORKER_THRESHOLD_BYTES,
    formatting: process.env.SIEAR_FORMATTING_WORKER_THRESHOLD_PARAGRAPHS,
    renderingSections: process.env.SIEAR_RENDER_WORKER_THRESHOLD_SECTIONS,
    renderingElements: process.env.SIEAR_RENDER_WORKER_THRESHOLD_ELEMENTS,
    concurrency: process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY,
    timeout: process.env.SIEAR_CPU_WORKER_TIMEOUT_MS,
  }

  function restore(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  afterEach(() => {
    restore('SIEAR_DOCX_WORKER_THRESHOLD_BYTES', original.extraction)
    restore(
      'SIEAR_FORMATTING_WORKER_THRESHOLD_PARAGRAPHS',
      original.formatting,
    )
    restore(
      'SIEAR_RENDER_WORKER_THRESHOLD_SECTIONS',
      original.renderingSections,
    )
    restore(
      'SIEAR_RENDER_WORKER_THRESHOLD_ELEMENTS',
      original.renderingElements,
    )
    restore('SIEAR_CPU_WORKER_MAX_CONCURRENCY', original.concurrency)
    restore('SIEAR_CPU_WORKER_TIMEOUT_MS', original.timeout)
  })

  it('centraliza thresholds conservadores de CPU-bound', () => {
    delete process.env.SIEAR_DOCX_WORKER_THRESHOLD_BYTES
    delete process.env.SIEAR_FORMATTING_WORKER_THRESHOLD_PARAGRAPHS
    delete process.env.SIEAR_RENDER_WORKER_THRESHOLD_SECTIONS
    delete process.env.SIEAR_RENDER_WORKER_THRESHOLD_ELEMENTS
    process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY = '1'
    delete process.env.SIEAR_CPU_WORKER_TIMEOUT_MS

    expect(resolveCpuWorkerPolicy()).toMatchObject({
      extractionThresholdBytes: Number.MAX_SAFE_INTEGER,
      formattingThresholdParagraphs: Number.MAX_SAFE_INTEGER,
      renderingThresholdSections: Number.MAX_SAFE_INTEGER,
      renderingThresholdElements: Number.MAX_SAFE_INTEGER,
      maxConcurrentWorkers: 1,
      timeoutMs: 120_000,
      profile: 'weak-pc',
    })
  })

  it('aceita overrides numericos positivos por ambiente', () => {
    process.env.SIEAR_DOCX_WORKER_THRESHOLD_BYTES = '4096'
    process.env.SIEAR_FORMATTING_WORKER_THRESHOLD_PARAGRAPHS = '80'
    process.env.SIEAR_RENDER_WORKER_THRESHOLD_SECTIONS = '3'
    process.env.SIEAR_RENDER_WORKER_THRESHOLD_ELEMENTS = '12'
    process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY = '2'
    process.env.SIEAR_CPU_WORKER_TIMEOUT_MS = '5000'

    expect(resolveCpuWorkerPolicy()).toMatchObject({
      extractionThresholdBytes: 4096,
      formattingThresholdParagraphs: 80,
      renderingThresholdSections: 3,
      renderingThresholdElements: 12,
      maxConcurrentWorkers: 2,
      timeoutMs: 5000,
      profile: 'standard-pc',
    })
  })
})
