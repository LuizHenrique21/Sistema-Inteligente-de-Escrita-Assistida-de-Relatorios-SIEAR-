import type { TemplateImportProgress } from '../types/template-import'

const STAGE_EXPECTED_MS: Record<TemplateImportProgress['step'], number> = {
  1: 8_000,
  2: 15_000,
  3: 180_000,
  4: 135_000,
  5: 8_000,
  6: 3_000,
  7: 1_000,
}

export interface TemplateCreationEstimate {
  currentStageRemainingMs: number
  totalRemainingMs: number
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function sectionFraction(message: string): number | null {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
  const match = /secao\s+(\d+)\s*\/\s*(\d+)/u.exec(normalized)
  if (!match) return null
  const current = Number(match[1])
  const total = Number(match[2])
  if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1)
    return null
  // Global profile and deterministic consolidation are additional work units.
  return bounded(current / (total + 2), 0.05, 0.95)
}

function currentStageEstimate(
  progress: TemplateImportProgress,
  elapsedMs: number,
): number {
  const expectedMs = STAGE_EXPECTED_MS[progress.step]
  const fraction = sectionFraction(progress.message)
  if (fraction === null)
    return Math.max(0, expectedMs - elapsedMs)
  const estimatedTotalMs = bounded(
    elapsedMs / fraction,
    expectedMs * 0.35,
    expectedMs * 4,
  )
  return Math.max(0, estimatedTotalMs - elapsedMs)
}

/**
 * Prediction derived from elapsed pipeline time and its actual section counter.
 * It is deliberately an estimate: no artificial timer advances pipeline state.
 */
export function estimateTemplateCreationTime(
  progress: TemplateImportProgress,
  stageStartedAt: number,
  now: number,
): TemplateCreationEstimate {
  const elapsedMs = Math.max(0, now - stageStartedAt)
  const currentStageRemainingMs = currentStageEstimate(progress, elapsedMs)
  const futureStages = (Object.keys(STAGE_EXPECTED_MS) as Array<
    `${TemplateImportProgress['step']}`
  >)
    .map(Number)
    .filter((step) => step > progress.step)
    .reduce(
      (total, step) =>
        total + STAGE_EXPECTED_MS[step as TemplateImportProgress['step']],
      0,
    )
  return {
    currentStageRemainingMs,
    totalRemainingMs: currentStageRemainingMs + futureStages,
  }
}

export function formatRemainingTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
}
