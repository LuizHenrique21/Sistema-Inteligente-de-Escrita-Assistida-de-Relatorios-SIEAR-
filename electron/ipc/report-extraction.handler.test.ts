import { describe, expect, it, vi } from 'vitest'
import type { ReportInformation } from '../../src/types/siear-api'
import { ReportExtractionServiceError } from '../services/ai/report-extraction.service'
import { createReportExtractionHandler } from './report-extraction.handler'

const report: ReportInformation = {
  equipment: 'notebook',
  activities: ['Substituição do HD'],
  result: null,
  problems: null,
  duration: null,
  observations: null,
}

describe('contrato ai:extract-report-information', () => {
  it.each([undefined, null, {}, { text: 10 }, { text: '   ' }])(
    'rejeita solicitação inválida: %o',
    async (request) => {
      const service = { extract: vi.fn() }
      const handle = createReportExtractionHandler(service)

      await expect(handle(request)).resolves.toEqual({
        success: false,
        error: {
          code: 'INVALID_TEXT',
          message: 'Digite uma descrição antes de extrair as informações.',
        },
      })
      expect(service.extract).not.toHaveBeenCalled()
    },
  )

  it('retorna dados estruturados e normaliza a entrada', async () => {
    const service = { extract: vi.fn().mockResolvedValue(report) }
    const handle = createReportExtractionHandler(service)

    await expect(handle({ text: '  Troquei o HD.  ' })).resolves.toEqual({
      success: true,
      data: report,
    })
    expect(service.extract).toHaveBeenCalledWith('Troquei o HD.')
  })

  it('serializa erro de validação sem expor detalhes internos', async () => {
    const service = {
      extract: vi
        .fn()
        .mockRejectedValue(
          new ReportExtractionServiceError('Resposta inválida.'),
        ),
    }
    const handle = createReportExtractionHandler(service)

    const result = await handle({ text: 'Descrição' })
    expect(result).toEqual({
      success: false,
      error: {
        code: 'INVALID_MODEL_RESPONSE',
        message: 'Resposta inválida.',
      },
    })
    expect(result).not.toHaveProperty('error.stack')
  })
})
