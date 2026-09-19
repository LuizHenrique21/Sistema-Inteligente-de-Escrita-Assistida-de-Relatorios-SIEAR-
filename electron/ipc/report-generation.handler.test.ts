import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReport } from '../../src/types/generated-report'
import { createRichReportTemplate } from '../testing/report-template.fixture'
import { createReportGenerationHandler } from './report-generation.handler'

const text = 'Troquei o HD do notebook Dell.'
const template = createRichReportTemplate('technical-report')

describe('contrato ai:generate-report', () => {
  it('busca o template confiável pelo ID', async () => {
    const report: GeneratedReport = {
      id: 'report-id',
      templateId: template.metadata.id,
      templateName: template.metadata.name,
      sections: [],
      createdAt: new Date().toISOString(),
    }
    const generator = {
      generate: vi.fn().mockResolvedValue({ success: true, data: report }),
    }
    const templates = {
      getById: vi.fn().mockResolvedValue(template),
    }
    const handle = createReportGenerationHandler(generator, templates)

    await expect(
      handle({ text, templateId: 'technical-report' }),
    ).resolves.toEqual({ success: true, data: report })
    expect(templates.getById).toHaveBeenCalledWith('technical-report')
    expect(generator.generate).toHaveBeenCalledWith(text, template)
  })

  it('rejeita solicitação inválida', async () => {
    const handle = createReportGenerationHandler(
      { generate: vi.fn() },
      { getById: vi.fn() },
    )
    await expect(handle({ text: '', templateId: '' })).resolves.toMatchObject({
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
      handle({ text, templateId: 'missing' }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND' },
    })
  })
})
