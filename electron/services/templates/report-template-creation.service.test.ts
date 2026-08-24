import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  createReportTemplateCreationContainer,
  createReportTemplateContainer,
  createProductionReportTemplateCreationContainer,
} from './report-template.container'
import { SqliteReportTemplateRepository } from '../../repositories/templates/sqlite-report-template.repository'
import { ReportTemplateCreationService } from './report-template-creation.service'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'

const OLD_TIMESTAMP = '2000-01-01T00:00:00.000Z'

function richTemplate(): ReportTemplate {
  const fieldEvidence = {
    source: 'paragraph' as const,
    elementId: 'paragraph-owner',
    excerpt: 'Responsável: valor variável',
    reason: 'Rótulo recorrente identificado no documento.',
  }
  const field = {
    name: 'responsavel',
    label: 'Responsável',
    type: 'text' as const,
    required: true,
    evidence: [fieldEvidence],
  }
  const writingEvidence = {
    sectionName: 'Execução',
    excerpt: 'Foi realizada a substituição do componente.',
    reason: 'Trecho demonstra o padrão procedimental.',
  }
  const style = {
    tone: 'técnico',
    formality: 'alta',
    technicality: 'alta',
    objectivity: 'alta',
    averageParagraphWords: 22,
    sentenceComplexity: 'média',
    grammaticalPerson: 'terceira pessoa',
    verbTense: 'pretérito',
    voice: 'passiva',
    firstPersonUsage: 'ausente',
    thirdPersonUsage: 'predominante',
    detailLevel: 'detalhado',
    narrativeStyle: 'procedimental',
    evidence: [writingEvidence],
  }
  const writingRule = {
    rule: 'Descrever as ações em ordem cronológica.',
    justification: 'Ordem recorrente nas atividades.',
    evidence: [writingEvidence],
  }
  const semanticEvidence = {
    sectionName: 'Execução',
    excerpt: 'Foi realizada a substituição do componente.',
    reason: 'Trecho contém ação e procedimento.',
  }
  const paragraphFormatting = {
    fontFamily: 'Arial',
    fontSizePt: 11,
    bold: false,
    italic: false,
    underline: false,
    alignment: 'justify',
    lineSpacing: 1.15,
    spaceBeforePt: 0,
    spaceAfterPt: 6,
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLineIndentPt: 18,
    styleId: 'Normal',
  }
  return {
    version: REPORT_TEMPLATE_VERSION,
    metadata: {
      id: 'analyzed-template',
      name: 'Modelo técnico aprendido',
      description: 'Padrão extraído de um DOCX.',
      documentType: 'Relatório técnico',
      status: 'confirmed',
      createdAt: OLD_TIMESTAMP,
      updatedAt: OLD_TIMESTAMP,
    },
    structurePattern: {
      documentType: 'Relatório técnico',
      mainTitle: 'Relatório de atividades',
      hierarchy: [
        {
          name: 'Atividade',
          level: 1,
          order: 1,
          purpose: 'Agrupar uma atividade.',
          required: true,
          repeatable: true,
          children: [
            {
              name: 'Execução',
              level: 2,
              order: 2,
              purpose: 'Registrar o procedimento.',
              required: true,
              repeatable: false,
              children: [],
            },
          ],
        },
      ],
      sections: [],
      fields: [field],
      activityPatterns: [
        {
          namePattern: 'Atividade {n}',
          sections: ['Execução'],
          order: 1,
          repeatable: true,
          fields: [field],
        },
      ],
      recurringElements: [],
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
    },
    writingPattern: {
      globalStyle: style,
      sectionStyles: [
        {
          ...style,
          sectionName: 'Execução',
          introductionPatterns: [],
          developmentPatterns: [writingRule],
          conclusionPatterns: [],
        },
      ],
      vocabulary: [],
      terminology: [],
      sentencePatterns: [writingRule],
      paragraphPatterns: [],
      narrativePatterns: [writingRule],
      forbiddenPatterns: [],
      recommendedPatterns: [writingRule],
    },
    semanticPattern: {
      documentType: 'Relatório técnico',
      sections: [
        {
          sectionName: 'Execução',
          purpose: 'Registrar ações realizadas.',
          expectedInformation: [
            {
              name: 'procedimento',
              description: 'Procedimento realizado.',
              informationType: 'procedure',
              required: true,
              evidence: [semanticEvidence],
            },
          ],
          excludedInformation: [],
          informationOrder: ['ação', 'procedimento'],
          relationships: [
            {
              targetSection: 'Resultado',
              relationship: 'A execução antecede o resultado.',
              evidence: [semanticEvidence],
            },
          ],
          narrativePattern: 'ação seguida de procedimento',
          detailLevel: 'detalhado',
          evidence: [semanticEvidence],
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
        pageWidthPt: 595.3,
        pageHeightPt: 841.9,
        orientation: 'portrait',
        margins: { topPt: 72, rightPt: 60, bottomPt: 72, leftPt: 60 },
        hasPageNumbering: true,
        pageBreakCount: 0,
        pageBreakBeforeSections: [],
      },
      headingStyles: [
        {
          level: 2,
          sectionNames: ['Execução'],
          sourceStyleId: 'Heading2',
          formatting: { ...paragraphFormatting, fontSizePt: 13, bold: true },
          evidence: { elementIds: ['heading-execution'], occurrences: 3 },
        },
      ],
      paragraphStyles: [
        {
          sectionName: 'Execução',
          sourceStyleId: 'Normal',
          formatting: paragraphFormatting,
          evidence: { elementIds: ['paragraph-execution'], occurrences: 3 },
        },
      ],
      listStyles: [],
      tableStyles: [],
      figureStyles: [],
      captionStyles: [],
      headerStyles: [],
      footerStyles: [],
      sourceStyleIds: ['Normal', 'Heading2'],
    },
    fields: [field],
    activityPatterns: [
      {
        namePattern: 'Atividade {n}',
        sections: ['Execução'],
        order: 1,
        repeatable: true,
        fields: [field],
      },
    ],
    requirements: {
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
      repeatableElements: ['Atividade', 'Atividade {n}'],
    },
  }
}

describe('ReportTemplateCreationService', () => {
  it('encadeia pipeline e service preservando progresso e o template analisado', async () => {
    const analyzed = richTemplate()
    const progress = vi.fn()
    const pipeline = { execute: vi.fn().mockResolvedValue(analyzed) }
    const templateService = {
      create: vi.fn().mockResolvedValue({
        ...analyzed,
        metadata: { ...analyzed.metadata, status: 'draft' },
      }),
    }
    const applicationService = new ReportTemplateCreationService(
      pipeline,
      templateService,
    )

    const result = await applicationService.createFromDocument(
      'modelo.docx',
      progress,
    )

    expect(pipeline.execute).toHaveBeenCalledWith('modelo.docx', progress)
    expect(templateService.create).toHaveBeenCalledWith(analyzed)
    expect(result.metadata.status).toBe('draft')
  })

  it('registra e recupera integralmente o template no repository oficial', async () => {
    const analyzed = richTemplate()
    const pipeline = { execute: vi.fn().mockResolvedValue(analyzed) }
    const container = createReportTemplateCreationContainer(pipeline)

    const result =
      await container.creationService.createFromDocument('modelo.docx')
    const persisted = await container.repository.getById(result.metadata.id)

    expect(result).toEqual(persisted)
    expect(result.version).toBe(REPORT_TEMPLATE_VERSION)
    expect(result.metadata.id).toBe(analyzed.metadata.id)
    expect(result.metadata.status).toBe('draft')
    expect(result.metadata.createdAt).toBe(result.metadata.updatedAt)
    expect(result.metadata.createdAt).not.toBe(OLD_TIMESTAMP)
    expect(Number.isNaN(Date.parse(result.metadata.createdAt))).toBe(false)
    expect(result.structurePattern.hierarchy[0]?.children[0]?.name).toBe(
      'Execução',
    )
    expect(result.fields[0]?.evidence[0]?.elementId).toBe('paragraph-owner')
    expect(result.activityPatterns[0]?.fields[0]?.evidence[0]?.reason).toBe(
      'Rótulo recorrente identificado no documento.',
    )
    expect(
      result.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toEqual(
      expect.objectContaining({
        justification: 'Ordem recorrente nas atividades.',
        evidence: [expect.objectContaining({ sectionName: 'Execução' })],
      }),
    )
    expect(result.semanticPattern.sections[0]?.relationships[0]).toEqual(
      expect.objectContaining({
        targetSection: 'Resultado',
        evidence: [expect.objectContaining({ reason: expect.any(String) })],
      }),
    )
    expect(result.formattingPattern.headingStyles[0]).toEqual(
      expect.objectContaining({
        formatting: expect.objectContaining({ fontSizePt: 13, bold: true }),
        evidence: { elementIds: ['heading-execution'], occurrences: 3 },
      }),
    )
    expect(result.requirements).toEqual(analyzed.requirements)
    expect(
      typeof result.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toBe('object')
    expect(typeof result.semanticPattern.sections[0]?.relationships[0]).toBe(
      'object',
    )
    expect(typeof result.formattingPattern.headingStyles[0]).toBe('object')
  })

  it('mantém o pipeline livre de dependências de repository', () => {
    const source = readFileSync(
      'electron/services/templates/template-creation.pipeline.ts',
      'utf8',
    )
    expect(source).not.toMatch(/repositories[\\/]/)
    expect(source).not.toContain('repository.create')
  })

  it('mantém containers básicos independentes do fluxo de criação', async () => {
    const basic = createReportTemplateContainer()
    await expect(basic.repository.getAll()).resolves.toEqual([])
    expect(basic).not.toHaveProperty('creationService')
  })

  it('compõe o container de produção com repository SQLite', () => {
    const production = createProductionReportTemplateCreationContainer(
      { execute: vi.fn() },
      ':memory:',
    )
    expect(production.repository).toBeInstanceOf(SqliteReportTemplateRepository)
    production.repository.close()
  })
})
