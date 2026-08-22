import { describe, expect, it, vi } from 'vitest'
import { createReportTemplateV2CreationContainer } from '../services/templates/report-template-v2.container'
import {
  REPORT_TEMPLATE_V2_VERSION,
  type ReportTemplateV2,
} from '../services/templates/report-template-v2.types'
import { createTemplatesV2Handlers } from './templates-v2.handler'

function template(): ReportTemplateV2 {
  const evidence = {
    sectionName: 'Execução',
    excerpt: 'Foi executado o procedimento.',
    reason: 'Trecho representativo.',
  }
  const field = {
    name: 'responsavel',
    label: 'Responsável',
    type: 'text' as const,
    required: true,
    evidence: [
      {
        source: 'paragraph' as const,
        elementId: 'p1',
        excerpt: 'Responsável: valor variável',
        reason: 'Rótulo identificado.',
      },
    ],
  }
  const style = {
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
  const rule = {
    rule: 'Descrever em ordem cronológica.',
    justification: 'Padrão recorrente.',
    evidence: [],
  }
  return {
    version: REPORT_TEMPLATE_V2_VERSION,
    metadata: {
      id: 'template-v2',
      name: 'Modelo V2',
      description: 'Modelo aprendido.',
      documentType: 'Relatório técnico',
      status: 'confirmed',
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    },
    structurePattern: {
      documentType: 'Relatório técnico',
      mainTitle: 'Relatório',
      hierarchy: [
        {
          name: 'Execução',
          level: 1,
          order: 1,
          purpose: 'Registrar a execução.',
          required: true,
          repeatable: false,
          children: [],
        },
      ],
      sections: [],
      activityPatterns: [],
      fields: [field],
      recurringElements: [],
      optionalElements: ['Observações'],
      requiredElements: ['Execução'],
    },
    writingPattern: {
      globalStyle: style,
      sectionStyles: [
        {
          ...style,
          sectionName: 'Execução',
          introductionPatterns: [],
          developmentPatterns: [rule],
          conclusionPatterns: [],
        },
      ],
      vocabulary: [],
      terminology: [],
      sentencePatterns: [rule],
      paragraphPatterns: [],
      narrativePatterns: [],
      forbiddenPatterns: [],
      recommendedPatterns: [],
    },
    semanticPattern: {
      documentType: 'Relatório técnico',
      sections: [
        {
          sectionName: 'Execução',
          purpose: 'Registrar o procedimento.',
          expectedInformation: [],
          excludedInformation: [],
          informationOrder: ['ação'],
          relationships: [
            {
              targetSection: 'Resultado',
              relationship: 'A execução antecede o resultado.',
              evidence: [evidence],
            },
          ],
          narrativePattern: 'ação e procedimento',
          detailLevel: 'detalhado',
          evidence: [evidence],
        },
      ],
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
        pageWidthPt: 595,
        pageHeightPt: 842,
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
      requiredElements: ['Execução'],
      optionalElements: ['Observações'],
      repeatableElements: [],
    },
  }
}

describe('handlers IPC de templates V2', () => {
  it('valida create-from-document e chama o CreationService', async () => {
    const creation = { createFromDocument: vi.fn().mockResolvedValue(template()) }
    const service = {
      getAll: vi.fn(), getById: vi.fn(), update: vi.fn(), confirm: vi.fn(), delete: vi.fn(),
    }
    const handlers = createTemplatesV2Handlers(creation, service)
    const progress = vi.fn()
    const result = await handlers.createFromDocument(
      { filePath: 'C:\\docs\\modelo.docx' }, progress,
    )
    expect(result).toMatchObject({ success: true, data: { version: 2 } })
    expect(creation.createFromDocument).toHaveBeenCalledWith(
      'C:\\docs\\modelo.docx', progress,
    )
  })

  it.each([
    [{ filePath: '' }],
    [{ filePath: 'modelo.txt' }],
    [{ filePath: ['a.docx', 'b.docx'] }],
    [null],
    ['modelo.docx'],
  ])('rejeita seleção inválida: %j', async (request) => {
    const creation = { createFromDocument: vi.fn() }
    const handlers = createTemplatesV2Handlers(creation, {
      getAll: vi.fn(), getById: vi.fn(), update: vi.fn(), confirm: vi.fn(), delete: vi.fn(),
    })
    await expect(handlers.createFromDocument(request)).resolves.toMatchObject({
      success: false, error: { code: 'VALIDATION_ERROR' },
    })
    expect(creation.createFromDocument).not.toHaveBeenCalled()
  })

  it('delega get-all e valida get-by-id', async () => {
    const service = {
      getAll: vi.fn().mockResolvedValue([template()]),
      getById: vi.fn().mockResolvedValue(template()),
      update: vi.fn(), confirm: vi.fn(), delete: vi.fn(),
    }
    const handlers = createTemplatesV2Handlers({ createFromDocument: vi.fn() }, service)
    await expect(handlers.getAll()).resolves.toMatchObject({ success: true })
    await expect(handlers.getById(' ')).resolves.toMatchObject({
      success: false, error: { code: 'VALIDATION_ERROR' },
    })
    await handlers.getById('template-v2')
    expect(service.getAll).toHaveBeenCalledOnce()
    expect(service.getById).toHaveBeenCalledWith('template-v2')
  })

  it('valida versão e estrutura antes de delegar update', async () => {
    const service = {
      getAll: vi.fn(), getById: vi.fn(),
      update: vi.fn().mockImplementation(async (value) => value),
      confirm: vi.fn(), delete: vi.fn(),
    }
    const handlers = createTemplatesV2Handlers({ createFromDocument: vi.fn() }, service)
    await expect(handlers.update({ ...template(), version: 1 })).resolves.toMatchObject({
      success: false, error: { code: 'INVALID_VERSION' },
    })
    await expect(handlers.update({ version: 2 })).resolves.toMatchObject({
      success: false, error: { code: 'VALIDATION_ERROR' },
    })
    await handlers.update(template())
    expect(service.update).toHaveBeenCalledOnce()
  })

  it('confirm aceita somente ID e delega ao Service', async () => {
    const service = {
      getAll: vi.fn(), getById: vi.fn(), update: vi.fn(),
      confirm: vi.fn().mockResolvedValue(template()), delete: vi.fn(),
    }
    const handlers = createTemplatesV2Handlers({ createFromDocument: vi.fn() }, service)
    await expect(handlers.confirm({ id: 'template-v2' })).resolves.toMatchObject({
      success: false, error: { code: 'VALIDATION_ERROR' },
    })
    await handlers.confirm('template-v2')
    expect(service.confirm).toHaveBeenCalledWith('template-v2')
  })

  it('valida ID e delega delete ao Service', async () => {
    const service = {
      getAll: vi.fn(), getById: vi.fn(), update: vi.fn(), confirm: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const handlers = createTemplatesV2Handlers({ createFromDocument: vi.fn() }, service)
    await expect(handlers.delete(10)).resolves.toMatchObject({ success: false })
    await expect(handlers.delete('template-v2')).resolves.toEqual({
      success: true, data: null,
    })
    expect(service.delete).toHaveBeenCalledWith('template-v2')
  })

  it('executa criação e CRUD sobre o mesmo repository em memória', async () => {
    const pipeline = { executeV2: vi.fn().mockResolvedValue(template()) }
    const container = createReportTemplateV2CreationContainer(pipeline)
    const handlers = createTemplatesV2Handlers(container.creationService, container.service)

    const created = await handlers.createFromDocument({ filePath: 'modelo.docx' })
    expect(created).toMatchObject({ success: true, data: { metadata: { status: 'draft' } } })
    await expect(handlers.getAll()).resolves.toMatchObject({ success: true, data: [expect.any(Object)] })
    await expect(handlers.getById('template-v2')).resolves.toMatchObject({ success: true, data: { metadata: { id: 'template-v2' } } })

    const updatedInput = structuredClone(template())
    updatedInput.metadata.name = 'Nome revisado'
    const updated = await handlers.update(updatedInput)
    expect(updated).toMatchObject({ success: true, data: { metadata: { name: 'Nome revisado', status: 'draft' } } })
    await expect(handlers.confirm('template-v2')).resolves.toMatchObject({ success: true, data: { metadata: { status: 'confirmed' } } })
    await expect(handlers.delete('template-v2')).resolves.toEqual({ success: true, data: null })
    await expect(handlers.getById('template-v2')).resolves.toEqual({ success: true, data: null })
  })
})
