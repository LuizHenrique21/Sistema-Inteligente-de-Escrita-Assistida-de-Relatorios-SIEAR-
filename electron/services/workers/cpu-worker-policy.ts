import os from 'node:os'

export interface CpuWorkerPolicy {
  extractionThresholdBytes: number
  formattingThresholdParagraphs: number
  renderingThresholdSections: number
  renderingThresholdElements: number
  maxConcurrentWorkers: number
  timeoutMs: number
  profile: 'weak-pc' | 'standard-pc'
}

const MiB = 1024 * 1024
const AUTOMATIC_WORKER_DISABLED_THRESHOLD = Number.MAX_SAFE_INTEGER

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function conservativeConcurrency(): number {
  const configured = Number(process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY)
  if (Number.isFinite(configured) && configured > 0)
    return Math.max(1, Math.floor(configured))
  const logicalCpuCount = os.cpus().length
  const totalMemoryBytes = os.totalmem()
  if (logicalCpuCount <= 4 || totalMemoryBytes <= 8 * MiB * 1024) return 1
  return 2
}

export function resolveCpuWorkerPolicy(): CpuWorkerPolicy {
  const maxConcurrentWorkers = conservativeConcurrency()
  return {
    extractionThresholdBytes: positiveNumber(
      process.env.SIEAR_DOCX_WORKER_THRESHOLD_BYTES,
      AUTOMATIC_WORKER_DISABLED_THRESHOLD,
    ),
    formattingThresholdParagraphs: positiveNumber(
      process.env.SIEAR_FORMATTING_WORKER_THRESHOLD_PARAGRAPHS,
      AUTOMATIC_WORKER_DISABLED_THRESHOLD,
    ),
    renderingThresholdSections: positiveNumber(
      process.env.SIEAR_RENDER_WORKER_THRESHOLD_SECTIONS,
      AUTOMATIC_WORKER_DISABLED_THRESHOLD,
    ),
    renderingThresholdElements: positiveNumber(
      process.env.SIEAR_RENDER_WORKER_THRESHOLD_ELEMENTS,
      AUTOMATIC_WORKER_DISABLED_THRESHOLD,
    ),
    maxConcurrentWorkers,
    timeoutMs: positiveNumber(process.env.SIEAR_CPU_WORKER_TIMEOUT_MS, 120_000),
    profile: maxConcurrentWorkers === 1 ? 'weak-pc' : 'standard-pc',
  }
}
