import { describe, expect, it, vi } from 'vitest'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'
import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import type {
  DocumentRepresentation,
  ParagraphFormatting,
} from '../documents/types'
import { ReportTemplateBuilder } from './report-template.builder'
import { TemplateCreationPipeline } from './template-creation.pipeline'

const document = { fileName: 'modelo.docx' } as DocumentRepresentation
const structure = { documentType: 'Relatório' } as StructurePattern
const writing = { globalStyle: { tone: 'formal' } } as WritingPattern
const semantic = { documentType: 'Relatório' } as SemanticPattern
const formatting = { documentStyle: {} } as FormattingPattern

function template(id: string): ReportTemplate {
  const timestamp = '2026-08-21T00:00:00.000Z'
  return {
    version: REPORT_TEMPLATE_VERSION,
    metadata: {
      id,
      name: 'Modelo',
      description: 'Modelo aprendido.',
      documentType: 'Relatório',
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    structurePattern: structure,
    writingPattern: writing,
    semanticPattern: semantic,
    formattingPattern: formatting,
    fields: [],
    activityPatterns: [],
    requirements: {
      requiredElements: [],
      optionalElements: [],
      repeatableElements: [],
    },
  }
}

describe('TemplateCreationPipeline', () => {
  it('executa todas as análises na ordem e publica as sete etapas', async () => {
    const calls: string[] = []
    const extractor = {
      extract: vi.fn(async () => {
        calls.push('extract')
        return document
      }),
    }
    const structureAnalyzer = {
      analyze: vi.fn(async () => {
        calls.push('structure')
        return structure
      }),
    }
    const writingAnalyzer = {
      analyze: vi.fn(async () => {
        calls.push('writing')
        return writing
      }),
    }
    const semanticAnalyzer = {
      analyze: vi.fn(async () => {
        calls.push('semantic')
        return semantic
      }),
    }
    const formattingAnalyzer = {
      analyze: vi.fn(() => {
        calls.push('formatting')
        return formatting
      }),
    }
    const builder = {
      build: vi.fn(() => {
        calls.push('builder')
        return template('template-1')
      }),
    }
    const progress: Array<{ step: number; message: string }> = []
    const result = await new TemplateCreationPipeline(
      extractor,
      structureAnalyzer,
      writingAnalyzer,
      semanticAnalyzer,
      formattingAnalyzer,
      builder,
    ).execute('C:\\documentos\\modelo.docx', (item) => progress.push(item))

    expect(result.metadata.id).toBe('template-1')
    expect(calls).toEqual([
      'extract',
      'structure',
      'writing',
      'semantic',
      'formatting',
      'builder',
    ])
    expect(progress.map((item) => item.step)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(progress.map((item) => item.message)).toEqual([
      'Lendo documento...',
      'Analisando estrutura...',
      'Analisando padrão de escrita...',
      'Analisando significado das seções...',
      'Analisando formatação...',
      'Construindo modelo...',
      'Modelo pronto para revisão.',
    ])
    expect(writingAnalyzer.analyze).toHaveBeenCalledWith(document, structure)
    expect(semanticAnalyzer.analyze).toHaveBeenCalledWith(
      document,
      structure,
      writing,
    )
    expect(builder.build).toHaveBeenCalledWith({
      document,
      structure,
      writing,
      semantic,
      formatting,
    })
  })

  it('interrompe o pipeline no erro e não publica progresso posterior', async () => {
    const error = new Error('DOCX inválido')
    const progress: number[] = []
    const pipeline = new TemplateCreationPipeline(
      { extract: vi.fn().mockRejectedValue(error) },
      { analyze: vi.fn() },
      { analyze: vi.fn() },
      { analyze: vi.fn() },
      { analyze: vi.fn() },
      { build: vi.fn() },
    )
    await expect(
      pipeline.execute('invalido.docx', (item) => progress.push(item.step)),
    ).rejects.toBe(error)
    expect(progress).toEqual([1])
  })

  it('cada execução constrói um modelo independente', async () => {
    let sequence = 0
    const builder = {
      build: vi.fn(() => template(`template-${++sequence}`)),
    }
    const pipeline = new TemplateCreationPipeline(
      { extract: vi.fn().mockResolvedValue(document) },
      { analyze: vi.fn().mockResolvedValue(structure) },
      { analyze: vi.fn().mockResolvedValue(writing) },
      { analyze: vi.fn().mockResolvedValue(semantic) },
      { analyze: vi.fn().mockReturnValue(formatting) },
      builder,
    )
    const first = await pipeline.execute('primeiro.docx')
    const second = await pipeline.execute('segundo.docx')
    expect(first.metadata.id).not.toBe(second.metadata.id)
    expect(builder.build).toHaveBeenCalledTimes(2)
  })

  it('preserva análises ricas no fluxo oficial sem achatamento', async () => {
    const fieldEvidence = {
      source: 'paragraph' as const,
      elementId: 'paragraph-responsavel',
      excerpt: 'Responsável: valor variável',
      reason: 'Rótulo recorrente identificado no documento.',
    }
    const richStructure: StructurePattern = {
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
      sections: [
        {
          name: 'Atividade',
          level: 1,
          order: 1,
          purpose: 'Agrupar uma atividade.',
          required: true,
          repeatable: true,
          children: [],
        },
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
      fields: [
        {
          name: 'responsavel',
          label: 'Responsável',
          type: 'text',
          required: true,
          evidence: [fieldEvidence],
        },
      ],
      activityPatterns: [
        {
          namePattern: 'Atividade {n}',
          sections: ['Execução'],
          order: 1,
          repeatable: true,
          fields: [
            {
              name: 'responsavel',
              label: 'Responsável',
              type: 'text',
              required: true,
              evidence: [fieldEvidence],
            },
          ],
        },
      ],
      recurringElements: [
        {
          type: 'section',
          name: 'Atividade',
          occurrences: 3,
          evidence: ['atividade-1', 'atividade-2', 'atividade-3'],
        },
      ],
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
    }
    const linguisticEvidence = {
      sectionName: 'Execução',
      excerpt: 'Foi executada a substituição do componente.',
      reason: 'Trecho demonstra escrita técnica e voz passiva.',
    }
    const styleProfile = {
      tone: 'técnico',
      formality: 'alta',
      technicality: 'alta',
      objectivity: 'alta',
      averageParagraphWords: 24,
      sentenceComplexity: 'média',
      grammaticalPerson: 'terceira pessoa',
      verbTense: 'pretérito',
      voice: 'passiva',
      firstPersonUsage: 'ausente',
      thirdPersonUsage: 'predominante',
      detailLevel: 'detalhado',
      narrativeStyle: 'procedimental',
      evidence: [linguisticEvidence],
    }
    const writingRule = {
      rule: 'Descrever ações em ordem cronológica.',
      justification: 'Sequência recorrente nas atividades.',
      evidence: [linguisticEvidence],
    }
    const richWriting: WritingPattern = {
      globalStyle: styleProfile,
      sectionStyles: [
        {
          ...styleProfile,
          sectionName: 'Execução',
          introductionPatterns: [],
          developmentPatterns: [writingRule],
          conclusionPatterns: [],
        },
      ],
      vocabulary: [writingRule],
      terminology: [],
      sentencePatterns: [writingRule],
      paragraphPatterns: [],
      narrativePatterns: [writingRule],
      forbiddenPatterns: [],
      recommendedPatterns: [writingRule],
    }
    const semanticEvidence = {
      sectionName: 'Execução',
      excerpt: 'Foi executada a substituição do componente.',
      reason: 'Evidencia a ação e o procedimento realizado.',
    }
    const richSemantic: SemanticPattern = {
      documentType: 'Relatório técnico',
      sections: [
        {
          sectionName: 'Execução',
          purpose: 'Registrar somente ações realizadas.',
          expectedInformation: [
            {
              name: 'procedimento',
              description: 'Procedimento efetivamente realizado.',
              informationType: 'procedure',
              required: true,
              evidence: [semanticEvidence],
            },
          ],
          excludedInformation: [
            {
              rule: 'Não presumir resultados.',
              justification: 'Resultados pertencem a outra seção.',
              evidence: [semanticEvidence],
            },
          ],
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
      activityPatterns: [
        {
          namePattern: 'Atividade {n}',
          occurrenceCount: 3,
          sectionSequence: ['Execução', 'Resultado'],
          semanticFlow: ['ação', 'procedimento', 'resultado'],
          evidence: [semanticEvidence],
        },
      ],
      fields: [],
      crossSectionRelations: [],
      uncertainties: [],
    }
    const paragraphFormatting: ParagraphFormatting = {
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
    const richFormatting: FormattingPattern = {
      documentStyle: {
        predominantFont: 'Arial',
        predominantFontSizePt: 11,
        sectionFonts: [
          { sectionName: 'Execução', fontFamily: 'Arial', fontSizePt: 11 },
        ],
        pageWidthPt: 595.3,
        pageHeightPt: 841.9,
        orientation: 'portrait',
        margins: { topPt: 72, rightPt: 60, bottomPt: 72, leftPt: 60 },
        hasPageNumbering: true,
        pageBreakCount: 1,
        pageBreakBeforeSections: ['Anexos'],
      },
      headingStyles: [
        {
          level: 2,
          sectionNames: ['Execução'],
          sourceStyleId: 'Heading2',
          formatting: { ...paragraphFormatting, bold: true, fontSizePt: 13 },
          evidence: { elementIds: ['heading-execucao'], occurrences: 3 },
        },
      ],
      paragraphStyles: [
        {
          sectionName: 'Execução',
          sourceStyleId: 'Normal',
          formatting: paragraphFormatting,
          evidence: { elementIds: ['paragraph-execucao'], occurrences: 3 },
        },
      ],
      listStyles: [],
      tableStyles: [],
      figureStyles: [],
      captionStyles: [],
      headerStyles: [],
      footerStyles: [],
      sourceStyleIds: ['Normal', 'Heading2'],
    }
    const builder = new ReportTemplateBuilder()
    const build = vi.spyOn(builder, 'build')
    const structureAnalyzer = {
      analyze: vi.fn().mockResolvedValue(richStructure),
    }
    const writingAnalyzer = {
      analyze: vi.fn().mockResolvedValue(richWriting),
    }
    const semanticAnalyzer = {
      analyze: vi.fn().mockResolvedValue(richSemantic),
    }
    const formattingAnalyzer = {
      analyze: vi.fn().mockReturnValue(richFormatting),
    }
    const pipeline = new TemplateCreationPipeline(
      { extract: vi.fn().mockResolvedValue(document) },
      structureAnalyzer,
      writingAnalyzer,
      semanticAnalyzer,
      formattingAnalyzer,
      builder,
    )
    const progress: number[] = []

    const result = await pipeline.execute('modelo.docx', (item) =>
      progress.push(item.step),
    )

    expect(structureAnalyzer.analyze).toHaveBeenCalledWith(document)
    expect(writingAnalyzer.analyze).toHaveBeenCalledWith(
      document,
      richStructure,
    )
    expect(semanticAnalyzer.analyze).toHaveBeenCalledWith(
      document,
      richStructure,
      richWriting,
    )
    expect(formattingAnalyzer.analyze).toHaveBeenCalledWith(document)
    expect(build).toHaveBeenCalledWith({
      document,
      structure: richStructure,
      writing: richWriting,
      semantic: richSemantic,
      formatting: richFormatting,
    })
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(result.version).toBe(REPORT_TEMPLATE_VERSION)
    expect(result.metadata.status).toBe('draft')
    expect(result.structurePattern.hierarchy[0]?.children[0]?.name).toBe(
      'Execução',
    )
    expect(result.fields[0]?.evidence[0]).toEqual(fieldEvidence)
    expect(result.activityPatterns[0]?.fields[0]?.evidence[0]).toEqual(
      fieldEvidence,
    )
    expect(
      result.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toEqual(writingRule)
    expect(
      result.semanticPattern.sections[0]?.excludedInformation[0]?.evidence[0],
    ).toEqual(semanticEvidence)
    expect(result.semanticPattern.sections[0]?.relationships[0]).toEqual(
      expect.objectContaining({
        targetSection: 'Resultado',
        evidence: [semanticEvidence],
      }),
    )
    expect(result.formattingPattern.headingStyles[0]).toEqual(
      expect.objectContaining({
        formatting: expect.objectContaining({ fontSizePt: 13, bold: true }),
        evidence: { elementIds: ['heading-execucao'], occurrences: 3 },
      }),
    )
    expect(result.formattingPattern.documentStyle.margins).toEqual({
      topPt: 72,
      rightPt: 60,
      bottomPt: 72,
      leftPt: 60,
    })
    expect(result.requirements).toEqual({
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
      repeatableElements: ['Atividade', 'Atividade {n}'],
    })
    expect(
      typeof result.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toBe('object')
    expect(typeof result.semanticPattern.sections[0]?.relationships[0]).toBe(
      'object',
    )
    expect(typeof result.formattingPattern.headingStyles[0]).toBe('object')
  })
})
