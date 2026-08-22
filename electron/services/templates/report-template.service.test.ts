import { beforeEach, describe, expect, it } from 'vitest'
import type { ReportTemplate } from '../../../src/types/report-template'
import { InMemoryReportTemplateRepository } from '../../repositories/templates/in-memory-report-template.repository'
import { TECHNICAL_REPORT_TEMPLATE } from './default-report-templates'
import {
  ReportTemplateService,
  ReportTemplateServiceError,
} from './report-template.service'

function template(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    id: 'custom-template',
    name: 'Modelo personalizado',
    description: 'Descrição do modelo.',
    objective: 'Registrar informações.',
    tone: 'formal',
    style: 'technical',
    formality: 'medium',
    sections: [
      {
        id: 'section-1',
        name: 'Introdução',
        description: 'Abertura.',
        required: true,
        order: 1,
      },
    ],
    fields: [],
    writingRules: [],
    recommendedVocabulary: [],
    forbiddenExpressions: [],
    ...overrides,
  }
}

describe('ReportTemplateService', () => {
  let service: ReportTemplateService

  beforeEach(() => {
    service = new ReportTemplateService(
      new InMemoryReportTemplateRepository([TECHNICAL_REPORT_TEMPLATE]),
    )
  })

  it('carrega o modelo inicial', async () => {
    const templates = await service.getAll()
    expect(templates).toHaveLength(1)
    expect(templates[0]?.name).toBe('Relatório Técnico')
    expect(templates[0]?.sections).toHaveLength(4)
  })

  it('cria e busca um modelo por ID', async () => {
    await service.create(template())
    await expect(service.getById('custom-template')).resolves.toMatchObject({
      name: 'Modelo personalizado',
    })
  })

  it('edita um modelo', async () => {
    await service.create(template())
    const updated = await service.update(
      'custom-template',
      template({ name: 'Modelo atualizado' }),
    )
    expect(updated.name).toBe('Modelo atualizado')
  })

  it('exclui um modelo', async () => {
    await service.create(template())
    await expect(service.delete('custom-template')).resolves.toBe(true)
    await expect(service.getById('custom-template')).resolves.toBeNull()
  })

  it('rejeita modelo sem nome', async () => {
    await expect(service.create(template({ name: ' ' }))).rejects.toMatchObject(
      {
        code: 'VALIDATION_ERROR',
      } satisfies Partial<ReportTemplateServiceError>,
    )
  })

  it('rejeita modelo sem seções', async () => {
    await expect(
      service.create(template({ sections: [] })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    } satisfies Partial<ReportTemplateServiceError>)
  })

  it('rejeita seções com a mesma ordem', async () => {
    const first = template().sections[0]!
    await expect(
      service.create(
        template({
          sections: [first, { ...first, id: 'section-2', name: 'Conclusão' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('rejeita IDs duplicados de seção', async () => {
    const first = template().sections[0]!
    await expect(
      service.create(
        template({
          sections: [first, { ...first, name: 'Conclusão', order: 2 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ID' })
  })

  it('detecta IDs duplicados mesmo com espaços', async () => {
    const first = template().sections[0]!
    await expect(
      service.create(
        template({
          sections: [first, { ...first, id: ` ${first.id} `, order: 2 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ID' })
  })

  it('rejeita ID de modelo duplicado', async () => {
    await service.create(template())
    await expect(service.create(template())).rejects.toMatchObject({
      code: 'DUPLICATE_ID',
    })
  })

  it('protege o estado interno contra mutações externas', async () => {
    const created = await service.create(template())
    created.name = 'Mutação externa'
    const stored = await service.getById('custom-template')
    expect(stored?.name).toBe('Modelo personalizado')
  })
})
