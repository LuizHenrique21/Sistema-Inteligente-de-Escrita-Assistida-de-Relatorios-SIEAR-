import { describe, expect, it, vi } from 'vitest'
import { createReportTemplateCreationContainer } from '../services/templates/report-template.container'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../src/domain/templates/report-template'
import { createTemplatesHandlers } from './templates.handler'
import { OllamaServiceError } from '../services/ollama/ollama.service'

function template(): ReportTemplate {
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
    version: REPORT_TEMPLATE_VERSION,
    metadata: {
      id: 'template',
      name: 'Modelo oficial',
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

describe('handlers IPC de templates', () => {
  it('valida create-from-document e chama o CreationService', async () => {
    const creation = {
      createFromDocument: vi.fn().mockResolvedValue(template()),
    }
    const service = {
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      confirm: vi.fn(),
      delete: vi.fn(),
    }
    const handlers = createTemplatesHandlers(creation, service)
    const progress = vi.fn()
    const result = await handlers.createFromDocument(
      { filePath: 'C:\\docs\\modelo.docx' },
      progress,
    )
    expect(result).toMatchObject({ success: true, data: { version: 2 } })
    expect(creation.createFromDocument).toHaveBeenCalledWith(
      'C:\\docs\\modelo.docx',
      progress,
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
    const handlers = createTemplatesHandlers(creation, {
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      confirm: vi.fn(),
      delete: vi.fn(),
    })
    await expect(handlers.createFromDocument(request)).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    })
    expect(creation.createFromDocument).not.toHaveBeenCalled()
  })

  it('preserva o código e a mensagem controlada de timeout do Ollama', async () => {
    const creation = {
      createFromDocument: vi
        .fn()
        .mockRejectedValue(
          new OllamaServiceError(
            'TIMEOUT',
            'O Ollama demorou demais para responder. Tente novamente.',
          ),
        ),
    }
    const handlers = createTemplatesHandlers(creation, {
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      confirm: vi.fn(),
      delete: vi.fn(),
    })

    await expect(
      handlers.createFromDocument({ filePath: 'modelo.docx' }),
    ).resolves.toEqual({
      success: false,
      error: {
        code: 'TIMEOUT',
        message: 'O Ollama demorou demais para responder. Tente novamente.',
      },
    })
  })

  it('delega get-all e valida get-by-id', async () => {
    const service = {
      getAll: vi.fn().mockResolvedValue([template()]),
      getById: vi.fn().mockResolvedValue(template()),
      update: vi.fn(),
      confirm: vi.fn(),
      delete: vi.fn(),
    }
    const handlers = createTemplatesHandlers(
      { createFromDocument: vi.fn() },
      service,
    )
    await expect(handlers.getAll()).resolves.toMatchObject({ success: true })
    await expect(handlers.getById(' ')).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    })
    await handlers.getById('template')
    expect(service.getAll).toHaveBeenCalledOnce()
    expect(service.getById).toHaveBeenCalledWith('template')
  })

  it('valida versão e estrutura antes de delegar update', async () => {
    const service = {
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn().mockImplementation(async (value) => value),
      confirm: vi.fn(),
      delete: vi.fn(),
    }
    const handlers = createTemplatesHandlers(
      { createFromDocument: vi.fn() },
      service,
    )
    await expect(
      handlers.update({ ...template(), version: 1 }),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_VERSION' },
    })
    await expect(handlers.update({ version: 2 })).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    })
    await handlers.update(template())
    expect(service.update).toHaveBeenCalledOnce()
  })

  it('confirm aceita somente ID e delega ao Service', async () => {
    const service = {
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      confirm: vi.fn().mockResolvedValue(template()),
      delete: vi.fn(),
    }
    const handlers = createTemplatesHandlers(
      { createFromDocument: vi.fn() },
      service,
    )
    await expect(handlers.confirm({ id: 'template' })).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    })
    await handlers.confirm('template')
    expect(service.confirm).toHaveBeenCalledWith('template')
  })

  it('valida ID e delega delete ao Service', async () => {
    const service = {
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      confirm: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const handlers = createTemplatesHandlers(
      { createFromDocument: vi.fn() },
      service,
    )
    await expect(handlers.delete(10)).resolves.toMatchObject({ success: false })
    await expect(handlers.delete('template')).resolves.toEqual({
      success: true,
      data: null,
    })
    expect(service.delete).toHaveBeenCalledWith('template')
  })

  it('executa criação e CRUD sobre o mesmo repository em memória', async () => {
    const pipeline = { execute: vi.fn().mockResolvedValue(template()) }
    const container = createReportTemplateCreationContainer(pipeline)
    const handlers = createTemplatesHandlers(
      container.creationService,
      container.service,
    )

    const created = await handlers.createFromDocument({
      filePath: 'modelo.docx',
    })
    expect(created).toMatchObject({
      success: true,
      data: { metadata: { status: 'draft' } },
    })
    await expect(handlers.getAll()).resolves.toMatchObject({
      success: true,
      data: [expect.any(Object)],
    })
    await expect(handlers.getById('template')).resolves.toMatchObject({
      success: true,
      data: { metadata: { id: 'template' } },
    })

    const updatedInput = structuredClone(template())
    updatedInput.metadata.name = 'Nome revisado'
    const updated = await handlers.update(updatedInput)
    expect(updated).toMatchObject({
      success: true,
      data: { metadata: { name: 'Nome revisado', status: 'draft' } },
    })
    await expect(handlers.confirm('template')).resolves.toMatchObject({
      success: true,
      data: { metadata: { status: 'confirmed' } },
    })
    await expect(handlers.delete('template')).resolves.toEqual({
      success: true,
      data: null,
    })
    await expect(handlers.getById('template')).resolves.toEqual({
      success: true,
      data: null,
    })
  })
})
