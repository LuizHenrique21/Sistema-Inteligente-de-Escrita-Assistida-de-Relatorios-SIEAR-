import { describe, expect, it } from 'vitest'
import { InMemoryReportTemplateRepository } from '../repositories/templates/in-memory-report-template.repository'
import { ReportTemplateService } from '../services/templates/report-template.service'
import { createTemplatesHandlers } from './templates.handler'

describe('contratos IPC de modelos', () => {
  const handlers = createTemplatesHandlers(
    new ReportTemplateService(new InMemoryReportTemplateRepository()),
  )

  it('rejeita payload de criação sem contrato válido', async () => {
    await expect(handlers.create({ name: 'Incompleto' })).resolves.toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'O modelo recebido é inválido.',
      },
    })
  })

  it('rejeita ID com tipo inválido', async () => {
    await expect(handlers.getById(123)).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    })
  })
})
