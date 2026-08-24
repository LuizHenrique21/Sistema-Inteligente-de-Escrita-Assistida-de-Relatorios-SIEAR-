import { beforeEach, describe, expect, it } from 'vitest'
import type { ParagraphFormatting } from '../../services/documents/types'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'
import {
  InMemoryReportTemplateRepository,
  type ReportTemplateRepositoryError,
} from './in-memory-report-template.repository'

const fieldEvidence = {
  source: 'paragraph' as const,
  elementId: 'paragraph-owner',
  excerpt: 'Responsável: valor variável',
  reason: 'Rótulo recorrente seguido por um valor.',
}

const writingEvidence = {
  sectionName: 'Execução',
  excerpt: 'Foi realizada a substituição do componente.',
  reason: 'Trecho evidencia escrita técnica e procedimental.',
}

const semanticEvidence = {
  sectionName: 'Execução',
  excerpt: 'Foi realizada a substituição do componente.',
  reason: 'Trecho contém ação e procedimento.',
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

function richTemplate(id = 'template'): ReportTemplate {
  const field = {
    name: 'responsavel',
    label: 'Responsável',
    type: 'text' as const,
    required: true,
    evidence: [fieldEvidence],
  }
  const style = {
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
    evidence: [writingEvidence],
  }
  const writingRule = {
    rule: 'Descrever as ações em ordem cronológica.',
    justification: 'A ordem é recorrente nas atividades.',
    evidence: [writingEvidence],
  }
  return {
    version: REPORT_TEMPLATE_VERSION,
    metadata: {
      id,
      name: 'Modelo técnico',
      description: 'Padrão aprendido a partir de um DOCX.',
      documentType: 'Relatório técnico',
      status: 'draft',
      createdAt: '2026-08-21T12:00:00.000Z',
      updatedAt: '2026-08-21T12:00:00.000Z',
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
      sections: [
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
      activityPatterns: [
        {
          namePattern: 'Atividade {n}',
          sections: ['Execução'],
          order: 1,
          repeatable: true,
          fields: [field],
        },
      ],
      fields: [field],
      recurringElements: [
        {
          type: 'section',
          name: 'Atividade',
          occurrences: 3,
          evidence: ['activity-1', 'activity-2', 'activity-3'],
        },
      ],
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
      vocabulary: [writingRule],
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
          purpose: 'Registrar ações e procedimentos realizados.',
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
    },
    formattingPattern: {
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

describe('InMemoryReportTemplateRepository', () => {
  let repository: InMemoryReportTemplateRepository

  beforeEach(() => {
    repository = new InMemoryReportTemplateRepository()
  })

  it('cria e recupera um template pelo ID', async () => {
    const created = await repository.create(richTemplate())
    expect(created.metadata.id).toBe('template')
    await expect(repository.getById('template')).resolves.toEqual(created)
  })

  it('retorna todos os templates armazenados', async () => {
    await repository.create(richTemplate('first'))
    await repository.create(richTemplate('second'))
    const templates = await repository.getAll()
    expect(templates.map((template) => template.metadata.id)).toEqual([
      'first',
      'second',
    ])
  })

  it('atualiza somente um template existente', async () => {
    await repository.create(richTemplate())
    const changed = richTemplate()
    changed.metadata.name = 'Modelo atualizado'
    changed.metadata.updatedAt = '2026-08-21T13:00:00.000Z'
    const updated = await repository.update(changed)
    expect(updated.metadata.name).toBe('Modelo atualizado')
    expect((await repository.getById('template'))?.metadata.updatedAt).toBe(
      '2026-08-21T13:00:00.000Z',
    )
  })

  it('remove pelo ID sem afetar outros templates', async () => {
    await repository.create(richTemplate('first'))
    await repository.create(richTemplate('second'))
    await repository.delete('first')
    await expect(repository.getById('first')).resolves.toBeNull()
    await expect(repository.getById('second')).resolves.not.toBeNull()
    await expect(repository.delete('missing')).resolves.toBeUndefined()
  })

  it('rejeita ID duplicado sem sobrescrever o existente', async () => {
    await repository.create(richTemplate())
    const duplicate = richTemplate()
    duplicate.metadata.name = 'Sobrescrita indevida'
    await expect(repository.create(duplicate)).rejects.toMatchObject({
      code: 'DUPLICATE_ID',
    } satisfies Partial<ReportTemplateRepositoryError>)
    expect((await repository.getById('template'))?.metadata.name).toBe(
      'Modelo técnico',
    )
  })

  it('retorna null ao buscar e rejeita atualização de template inexistente', async () => {
    await expect(repository.getById('missing')).resolves.toBeNull()
    await expect(
      repository.update(richTemplate('missing')),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ReportTemplateRepositoryError>)
  })

  it('rejeita versões incorretas e objetos legados de maneira controlada', async () => {
    const invalidVersion = {
      ...richTemplate(),
      version: 1,
    } as unknown as ReportTemplate
    await expect(repository.create(invalidVersion)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining(String(REPORT_TEMPLATE_VERSION)),
    })
    await expect(
      repository.create({
        id: 'obsolete-template',
      } as unknown as ReportTemplate),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('valida ID, metadata e estrutura mínima', async () => {
    const missingId = richTemplate()
    missingId.metadata.id = ' '
    await expect(repository.create(missingId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    const missingStructure = richTemplate()
    missingStructure.structurePattern = null as never
    await expect(repository.create(missingStructure)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('isola o armazenamento de mutações no objeto original e retornado', async () => {
    const original = richTemplate()
    const created = await repository.create(original)
    original.fields[0]!.evidence[0]!.reason = 'Mutação no original'
    created.writingPattern.sectionStyles[0]!.developmentPatterns[0]!.evidence[0]!.excerpt =
      'Mutação no retorno de create'

    const firstRead = await repository.getById('template')
    expect(firstRead?.fields[0]?.evidence[0]?.reason).toBe(
      'Rótulo recorrente seguido por um valor.',
    )
    expect(
      firstRead?.writingPattern.sectionStyles[0]?.developmentPatterns[0]
        ?.evidence[0]?.excerpt,
    ).toBe('Foi realizada a substituição do componente.')

    firstRead!.semanticPattern.sections[0]!.relationships[0]!.evidence[0]!.reason =
      'Mutação no retorno de getById'
    const secondRead = await repository.getById('template')
    expect(
      secondRead?.semanticPattern.sections[0]?.relationships[0]?.evidence[0]
        ?.reason,
    ).toBe('Trecho contém ação e procedimento.')

    const all = await repository.getAll()
    all[0]!.formattingPattern.headingStyles[0]!.formatting.fontSizePt = 99
    expect(
      (await repository.getById('template'))?.formattingPattern.headingStyles[0]
        ?.formatting.fontSizePt,
    ).toBe(13)
  })

  it('preserva profundamente toda a estrutura rica', async () => {
    const expected = richTemplate()
    await repository.create(expected)
    const stored = await repository.getById(expected.metadata.id)

    expect(stored).toEqual(expected)
    expect(stored?.structurePattern.hierarchy[0]?.children[0]?.name).toBe(
      'Execução',
    )
    expect(stored?.fields[0]?.evidence[0]).toEqual(fieldEvidence)
    expect(
      stored?.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toEqual(
      expect.objectContaining({
        justification: 'A ordem é recorrente nas atividades.',
        evidence: [writingEvidence],
      }),
    )
    expect(stored?.semanticPattern.sections[0]?.relationships[0]).toEqual(
      expect.objectContaining({
        targetSection: 'Resultado',
        evidence: [semanticEvidence],
      }),
    )
    expect(stored?.formattingPattern.headingStyles[0]).toEqual(
      expect.objectContaining({
        formatting: expect.objectContaining({ fontSizePt: 13, bold: true }),
        evidence: { elementIds: ['heading-execution'], occurrences: 3 },
      }),
    )
    expect(stored?.formattingPattern.paragraphStyles[0]?.formatting).toEqual(
      paragraphFormatting,
    )
    expect(stored?.formattingPattern.documentStyle.margins.leftPt).toBe(60)
    expect(stored?.activityPatterns[0]?.fields[0]?.evidence[0]).toEqual(
      fieldEvidence,
    )
    expect(stored?.requirements.requiredElements).toEqual([
      'Atividade',
      'Execução',
    ])
  })
})
