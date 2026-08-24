import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportTemplateRepository } from '../../repositories/templates/report-template.repository'
import { createReportTemplateContainer } from './report-template.container'
import {
  ReportTemplateService,
  type ReportTemplateServiceError,
} from './report-template.service'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'

const INITIAL_TIME = '2026-08-21T12:00:00.000Z'
const SERVICE_TIME = '2026-08-21T13:00:00.000Z'

function template(
  overrides: Partial<ReportTemplate['metadata']> = {},
): ReportTemplate {
  const field = {
    name: 'responsavel',
    label: 'Responsável',
    type: 'text' as const,
    required: true,
    evidence: [
      {
        source: 'paragraph' as const,
        elementId: 'paragraph-1',
        excerpt: 'Responsável: valor variável',
        reason: 'Campo identificado por rótulo.',
      },
    ],
  }
  const writingStyle = {
    tone: 'técnico',
    formality: 'alta',
    technicality: 'alta',
    objectivity: 'alta',
    averageParagraphWords: 20,
    sentenceComplexity: 'média',
    grammaticalPerson: 'terceira pessoa',
    verbTense: 'pretérito',
    voice: 'passiva',
    firstPersonUsage: 'ausente',
    thirdPersonUsage: 'predominante',
    detailLevel: 'detalhado',
    narrativeStyle: 'procedimental',
    evidence: [],
  }
  return {
    version: REPORT_TEMPLATE_VERSION,
    metadata: {
      id: 'template',
      name: 'Modelo oficial',
      description: 'Modelo aprendido.',
      documentType: 'Relatório técnico',
      status: 'draft',
      createdAt: INITIAL_TIME,
      updatedAt: INITIAL_TIME,
      ...overrides,
    },
    structurePattern: {
      documentType: 'Relatório técnico',
      mainTitle: 'Relatório',
      hierarchy: [],
      sections: [],
      activityPatterns: [],
      fields: [field],
      recurringElements: [],
      optionalElements: [],
      requiredElements: [],
    },
    writingPattern: {
      globalStyle: writingStyle,
      sectionStyles: [],
      vocabulary: [],
      terminology: [],
      sentencePatterns: [],
      paragraphPatterns: [],
      narrativePatterns: [],
      forbiddenPatterns: [],
      recommendedPatterns: [],
    },
    semanticPattern: {
      documentType: 'Relatório técnico',
      sections: [],
      activityPatterns: [],
      fields: [],
      crossSectionRelations: [],
      uncertainties: [],
    },
    formattingPattern: {
      documentStyle: {
        predominantFont: 'Arial',
        predominantFontSizePt: 11,
        sectionFonts: [],
        pageWidthPt: 595.3,
        pageHeightPt: 841.9,
        orientation: 'portrait',
        margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
        hasPageNumbering: true,
        pageBreakCount: 0,
        pageBreakBeforeSections: [],
      },
      headingStyles: [],
      paragraphStyles: [],
      listStyles: [],
      tableStyles: [],
      figureStyles: [],
      captionStyles: [],
      headerStyles: [],
      footerStyles: [],
      sourceStyleIds: [],
    },
    fields: [field],
    activityPatterns: [],
    requirements: {
      requiredElements: [],
      optionalElements: [],
      repeatableElements: [],
    },
  }
}

function repositoryMock(): ReportTemplateRepository {
  return {
    create: vi.fn(async (value) => structuredClone(value)),
    getById: vi.fn(async () => null),
    getAll: vi.fn(async () => []),
    update: vi.fn(async (value) => structuredClone(value)),
    delete: vi.fn(async () => undefined),
  }
}

describe('ReportTemplateService', () => {
  let repository: ReportTemplateRepository
  let service: ReportTemplateService

  beforeEach(() => {
    repository = repositoryMock()
    service = new ReportTemplateService(repository, () => SERVICE_TIME)
  })

  it('delega create com estado e timestamps controlados pelo domínio', async () => {
    const input = template({
      status: 'confirmed',
      createdAt: 'data externa',
      updatedAt: 'data externa',
    })
    const created = await service.create(input)
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          status: 'draft',
          createdAt: SERVICE_TIME,
          updatedAt: SERVICE_TIME,
        }),
      }),
    )
    expect(created.metadata.status).toBe('draft')
  })

  it('delega getById e retorna uma cópia independente', async () => {
    const stored = template()
    vi.mocked(repository.getById).mockResolvedValue(stored)
    const result = await service.getById('template')
    expect(repository.getById).toHaveBeenCalledWith('template')
    expect(result).toEqual(stored)
    expect(result).not.toBe(stored)
  })

  it('delega getAll e clona cada resultado', async () => {
    const stored = [template({ id: 'first' }), template({ id: 'second' })]
    vi.mocked(repository.getAll).mockResolvedValue(stored)
    const result = await service.getAll()
    expect(repository.getAll).toHaveBeenCalledOnce()
    expect(result).toEqual(stored)
    expect(result[0]).not.toBe(stored[0])
  })

  it('atualiza conteúdo preservando estado e criação persistidos', async () => {
    const stored = template({ status: 'confirmed' })
    vi.mocked(repository.getById).mockResolvedValue(stored)
    const input = template({
      name: 'Nome atualizado',
      status: 'draft',
      createdAt: 'alteração externa',
      updatedAt: 'alteração externa',
    })
    const updated = await service.update(input)
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          ...stored.metadata,
          name: 'Nome atualizado',
          status: 'confirmed',
          createdAt: INITIAL_TIME,
          updatedAt: SERVICE_TIME,
        },
      }),
    )
    expect(updated.metadata.status).toBe('confirmed')
    expect(updated.metadata.updatedAt).toBe(SERVICE_TIME)
  })

  it('rejeita update quando o template não existe', async () => {
    await expect(service.update(template())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ReportTemplateServiceError>)
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('delega delete sem introduzir semântica adicional', async () => {
    await service.delete('template')
    expect(repository.delete).toHaveBeenCalledWith('template')
  })

  it('confirma um template draft e persiste a transição', async () => {
    const stored = template({ status: 'draft' })
    vi.mocked(repository.getById).mockResolvedValue(stored)
    const confirmed = await service.confirm('template')
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ status: 'confirmed' }),
      }),
    )
    expect(confirmed.metadata.status).toBe('confirmed')
  })

  it('atualiza updatedAt durante a confirmação e preserva createdAt', async () => {
    const stored = template({ status: 'draft' })
    vi.mocked(repository.getById).mockResolvedValue(stored)
    const confirmed = await service.confirm('template')
    expect(confirmed.metadata.createdAt).toBe(INITIAL_TIME)
    expect(confirmed.metadata.updatedAt).toBe(SERVICE_TIME)
  })

  it('rejeita confirmação de ID inexistente', async () => {
    await expect(service.confirm('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ReportTemplateServiceError>)
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('rejeita versão inválida antes de criar, atualizar ou confirmar', async () => {
    const invalid = { ...template(), version: 1 } as unknown as ReportTemplate
    await expect(service.create(invalid)).rejects.toMatchObject({
      code: 'INVALID_VERSION',
    })
    await expect(service.update(invalid)).rejects.toMatchObject({
      code: 'INVALID_VERSION',
    })
    vi.mocked(repository.getById).mockResolvedValue(invalid)
    await expect(service.confirm('template')).rejects.toMatchObject({
      code: 'INVALID_VERSION',
    })
  })

  it('rejeita confirmação de template que não está em draft', async () => {
    vi.mocked(repository.getById).mockResolvedValue(
      template({ status: 'confirmed' }),
    )
    await expect(service.confirm('template')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    } satisfies Partial<ReportTemplateServiceError>)
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('não modifica silenciosamente os objetos recebidos ou persistidos', async () => {
    const input = template({ status: 'confirmed' })
    const inputSnapshot = structuredClone(input)
    await service.create(input)
    expect(input).toEqual(inputSnapshot)

    const stored = template({ status: 'draft' })
    const storedSnapshot = structuredClone(stored)
    vi.mocked(repository.getById).mockResolvedValue(stored)
    await service.confirm('template')
    expect(stored).toEqual(storedSnapshot)
  })

  it('compõe instâncias independentes sem criar singleton global', () => {
    const first = createReportTemplateContainer()
    const second = createReportTemplateContainer()
    expect(first.service).toBeInstanceOf(ReportTemplateService)
    expect(first.service).not.toBe(second.service)
    expect(first.repository).not.toBe(second.repository)
  })
})
