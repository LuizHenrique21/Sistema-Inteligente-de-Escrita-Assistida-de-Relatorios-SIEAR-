import { describe, expect, it } from 'vitest'
import {
  estimateTemplateCreationTime,
  formatRemainingTime,
} from './template-creation-time'

describe('template creation time estimate', () => {
  it('estimates the current and total remaining time from a pipeline stage', () => {
    const estimate = estimateTemplateCreationTime(
      { step: 3, message: 'Analisando padrão de escrita...' },
      0,
      30_000,
    )
    expect(estimate.currentStageRemainingMs).toBe(150_000)
    expect(estimate.totalRemainingMs).toBe(297_000)
  })

  it('uses the real section counter to refine the active analysis estimate', () => {
    const estimate = estimateTemplateCreationTime(
      { step: 4, message: 'Analisando secao 10/20...' },
      0,
      60_000,
    )
    expect(estimate.currentStageRemainingMs).toBeGreaterThan(0)
    expect(estimate.currentStageRemainingMs).toBeLessThan(100_000)
  })

  it('formats a compact remaining time label', () => {
    expect(formatRemainingTime(59_001)).toBe('1 min 00 s')
    expect(formatRemainingTime(7_000)).toBe('7s')
  })
})
