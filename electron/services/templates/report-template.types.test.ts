import { describe, expect, it } from 'vitest'
import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import type { ParagraphFormatting } from '../documents/types'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'

const evidence = {
  sectionName: 'Execução',
  excerpt: 'A substituição foi realizada conforme o procedimento técnico.',
  reason: 'Trecho demonstra o padrão procedimental da seção.',
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

const structurePattern: StructurePattern = {
  documentType: 'Relatório técnico',
  mainTitle: 'Relatório técnico de atividade',
  hierarchy: [
    {
      name: 'Atividade',
      level: 1,
      order: 1,
      purpose: 'Agrupar uma atividade executada.',
      required: true,
      repeatable: true,
      children: [
        {
          name: 'Execução',
          level: 2,
          order: 2,
          purpose: 'Descrever o procedimento realizado.',
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
      purpose: 'Descrever o procedimento realizado.',
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
      fields: [
        {
          name: 'responsavel',
          label: 'Responsável',
          type: 'text',
          required: true,
          evidence: [
            {
              source: 'paragraph',
              elementId: 'paragraph-1',
              excerpt: 'Responsável: exemplo variável',
              reason: 'O rótulo identifica um campo variável.',
            },
          ],
        },
      ],
    },
  ],
  fields: [
    {
      name: 'responsavel',
      label: 'Responsável',
      type: 'text',
      required: true,
      evidence: [
        {
          source: 'paragraph',
          elementId: 'paragraph-1',
          excerpt: 'Responsável: exemplo variável',
          reason: 'O rótulo identifica um campo variável.',
        },
      ],
    },
  ],
  recurringElements: [
    {
      type: 'section',
      name: 'Atividade',
      occurrences: 3,
      evidence: ['heading-1', 'heading-4', 'heading-7'],
    },
  ],
  optionalElements: ['Observações'],
  requiredElements: ['Atividade', 'Execução'],
}

const writingPattern: WritingPattern = {
  globalStyle: {
    tone: 'técnico',
    formality: 'alta',
    technicality: 'alta',
    objectivity: 'alta',
    averageParagraphWords: 24,
    sentenceComplexity: 'média',
    grammaticalPerson: 'terceira pessoa',
    verbTense: 'pretérito perfeito',
    voice: 'passiva',
    firstPersonUsage: 'ausente',
    thirdPersonUsage: 'predominante',
    detailLevel: 'procedimental',
    narrativeStyle: 'cronológico',
    evidence: [evidence],
  },
  sectionStyles: [
    {
      sectionName: 'Execução',
      tone: 'técnico',
      formality: 'alta',
      technicality: 'alta',
      objectivity: 'alta',
      averageParagraphWords: 30,
      sentenceComplexity: 'média',
      grammaticalPerson: 'terceira pessoa',
      verbTense: 'pretérito perfeito',
      voice: 'passiva',
      firstPersonUsage: 'ausente',
      thirdPersonUsage: 'predominante',
      detailLevel: 'detalhado',
      narrativeStyle: 'procedimental',
      evidence: [evidence],
      introductionPatterns: [],
      developmentPatterns: [
        {
          rule: 'Apresentar as ações em ordem cronológica.',
          justification: 'Ordem recorrente nas atividades analisadas.',
          evidence: [evidence],
        },
      ],
      conclusionPatterns: [],
    },
  ],
  vocabulary: [],
  terminology: [],
  sentencePatterns: [],
  paragraphPatterns: [],
  narrativePatterns: [],
  forbiddenPatterns: [],
  recommendedPatterns: [],
}

const semanticPattern: SemanticPattern = {
  documentType: 'Relatório técnico',
  sections: [
    {
      sectionName: 'Execução',
      purpose: 'Registrar ações e procedimentos efetivamente realizados.',
      expectedInformation: [
        {
          name: 'procedimento',
          description: 'Procedimento informado pelo usuário.',
          informationType: 'procedure',
          required: true,
          evidence: [evidence],
        },
      ],
      excludedInformation: [
        {
          rule: 'Não incluir resultados não informados.',
          justification: 'A seção descreve execução, não resultado presumido.',
          evidence: [evidence],
        },
      ],
      informationOrder: ['ação', 'procedimento'],
      relationships: [
        {
          targetSection: 'Resultado',
          relationship: 'A execução antecede o resultado quando informado.',
          evidence: [evidence],
        },
      ],
      narrativePattern: 'ação seguida de procedimento',
      detailLevel: 'detalhado',
      evidence: [evidence],
    },
  ],
  activityPatterns: [
    {
      namePattern: 'Atividade {n}',
      occurrenceCount: 3,
      sectionSequence: ['Execução', 'Resultado'],
      semanticFlow: ['ação', 'procedimento', 'resultado'],
      evidence: [evidence],
    },
  ],
  fields: [
    {
      name: 'responsavel',
      label: 'Responsável',
      semanticRole: 'Pessoa responsável pela execução.',
      valueType: 'text',
      required: true,
      evidence: [evidence],
    },
  ],
  crossSectionRelations: [],
  uncertainties: [],
}

const formattingPattern: FormattingPattern = {
  documentStyle: {
    predominantFont: 'Arial',
    predominantFontSizePt: 11,
    sectionFonts: [
      { sectionName: 'Execução', fontFamily: 'Arial', fontSizePt: 11 },
    ],
    pageWidthPt: 595.3,
    pageHeightPt: 841.9,
    orientation: 'portrait',
    margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
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
      evidence: { elementIds: ['heading-2'], occurrences: 3 },
    },
  ],
  paragraphStyles: [
    {
      sectionName: 'Execução',
      sourceStyleId: 'Normal',
      formatting: paragraphFormatting,
      evidence: { elementIds: ['paragraph-2'], occurrences: 3 },
    },
  ],
  listStyles: [],
  tableStyles: [],
  figureStyles: [],
  captionStyles: [],
  headerStyles: [],
  footerStyles: [
    {
      variant: 'default',
      paragraphCount: 1,
      text: 'Página',
      containsPageNumber: true,
      formatting: paragraphFormatting,
      evidence: { elementIds: ['footer-1'], occurrences: 1 },
    },
  ],
  sourceStyleIds: ['Normal', 'Heading2'],
}

const template = {
  version: REPORT_TEMPLATE_VERSION,
  metadata: {
    id: 'template-1',
    name: 'Modelo técnico aprendido',
    description: 'Padrão reutilizável extraído de um único DOCX.',
    documentType: 'Relatório técnico',
    status: 'draft',
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  },
  structurePattern,
  writingPattern,
  semanticPattern,
  formattingPattern,
  fields: structurePattern.fields,
  activityPatterns: structurePattern.activityPatterns,
  requirements: {
    requiredElements: ['Atividade', 'Execução'],
    optionalElements: ['Observações'],
    repeatableElements: ['Atividade'],
  },
} satisfies ReportTemplate

describe('ReportTemplate oficial', () => {
  it('preserva versão, metadados, campos, atividades e requisitos', () => {
    expect(template.version).toBe(2)
    expect(template.metadata).toMatchObject({
      id: 'template-1',
      documentType: 'Relatório técnico',
      status: 'draft',
    })
    expect(template.fields[0]?.evidence[0]?.elementId).toBe('paragraph-1')
    expect(template.activityPatterns[0]?.fields[0]?.name).toBe('responsavel')
    expect(template.requirements).toEqual({
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
      repeatableElements: ['Atividade'],
    })
  })

  it('contém integralmente os quatro padrões especializados', () => {
    expect(template.structurePattern).toBe(structurePattern)
    expect(template.writingPattern).toBe(writingPattern)
    expect(template.semanticPattern).toBe(semanticPattern)
    expect(template.formattingPattern).toBe(formattingPattern)
  })

  it('preserva estruturas complexas sem reduzi-las a strings', () => {
    const sectionStyle = template.writingPattern.sectionStyles[0]
    const semanticSection = template.semanticPattern.sections[0]
    const headingStyle = template.formattingPattern.headingStyles[0]

    expect(sectionStyle?.developmentPatterns[0]).toEqual(
      expect.objectContaining({
        rule: 'Apresentar as ações em ordem cronológica.',
        evidence: [expect.objectContaining({ sectionName: 'Execução' })],
      }),
    )
    expect(semanticSection?.relationships[0]).toEqual(
      expect.objectContaining({
        targetSection: 'Resultado',
        evidence: [expect.objectContaining({ reason: expect.any(String) })],
      }),
    )
    expect(headingStyle?.formatting).toMatchObject({
      fontFamily: 'Arial',
      fontSizePt: 13,
      bold: true,
      alignment: 'justify',
    })
    expect(typeof sectionStyle).toBe('object')
    expect(typeof semanticSection).toBe('object')
    expect(typeof headingStyle).toBe('object')
  })

  it('mantém conteúdo gerado fora do contrato do template', () => {
    expect(template).not.toHaveProperty('sections')
    expect(template).not.toHaveProperty('generatedReport')
    expect(template).not.toHaveProperty('content')
  })
})
