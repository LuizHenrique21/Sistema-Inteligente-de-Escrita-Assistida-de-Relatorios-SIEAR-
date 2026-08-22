import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReport } from '../../src/types/generated-report'
import { TECHNICAL_REPORT_TEMPLATE } from '../services/templates/default-report-templates'
import { createReportGenerationHandler } from './report-generation.handler'

const information = {
  equipment: 'Notebook Dell',
  activities: ['Substituição do HD'],
  result: null,
  problems: null,
  duration: null,
  observations: null,
}

describe('contrato ai:generate-report', () => {
  it('busca o template confiável pelo ID', async () => {
    const report: GeneratedReport = {
      id: 'report-id',
      templateId: TECHNICAL_REPORT_TEMPLATE.id,
      templateName: TECHNICAL_REPORT_TEMPLATE.name,
      sections: [],
      createdAt: new Date().toISOString(),
    }
    const generator = { generate: vi.fn().mockResolvedValue(report) }
    const templates = {
      getById: vi.fn().mockResolvedValue(TECHNICAL_REPORT_TEMPLATE),
    }
    const handle = createReportGenerationHandler(generator, templates)

    await expect(
      handle({ information, templateId: 'technical-report' }),
    ).resolves.toEqual({ success: true, data: report })
    expect(templates.getById).toHaveBeenCalledWith('technical-report')
    expect(generator.generate).toHaveBeenCalledWith(
      information,
      TECHNICAL_REPORT_TEMPLATE,
    )
  })

  it('rejeita solicitação inválida', async () => {
    const handle = createReportGenerationHandler(
      { generate: vi.fn() },
      { getById: vi.fn() },
    )
    await expect(
      handle({ information: {}, templateId: '' }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    })
  })

  it('retorna erro quando o template não existe', async () => {
    const handle = createReportGenerationHandler(
      { generate: vi.fn() },
      { getById: vi.fn().mockResolvedValue(null) },
    )
    await expect(
      handle({ information, templateId: 'missing' }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND' },
    })
  })
})
