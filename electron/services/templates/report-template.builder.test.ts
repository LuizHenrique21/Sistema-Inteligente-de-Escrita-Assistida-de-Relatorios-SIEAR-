import { describe, expect, it } from 'vitest'
import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
  WritingStyleProfile,
} from '../../../src/domain/templates'
import type {
  DocumentRepresentation,
  ParagraphFormatting,
} from '../documents/types'
import { ReportTemplateBuilder } from './report-template.builder'
import { REPORT_TEMPLATE_VERSION } from '../../../src/domain/templates/report-template'

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
const document: DocumentRepresentation = {
  fileName: 'relatorio-joao.docx',
  fileType: 'docx',
  text: 'João Silva Sprint 1 Atividade X',
  metadata: {
    fileSize: 100,
    extractedAt: '2026-08-21T00:00:00.000Z',
    title: 'Relatório João Silva',
    author: 'João Silva',
    createdAt: null,
    modifiedAt: null,
  },
  elements: [],
  paragraphs: [],
  sections: [],
  headings: [],
  lists: [],
  tables: [],
  figures: [],
  headers: [],
  footers: [],
  pageInformation: {
    widthPt: 612,
    heightPt: 792,
    orientation: 'portrait',
    margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
    pageBreakCount: 0,
    hasPageNumbering: true,
  },
  formatting: { defaultParagraph: paragraphFormatting },
  styles: [],
}

const description1 = {
  name: 'Descrição',
  level: 2,
  order: 2,
  purpose: 'Descrever a execução.',
  required: true,
  repeatable: false,
  children: [],
}
const description2 = { ...description1, order: 5 }
const structure: StructurePattern = {
  documentType: 'Relatório de sprint',
  mainTitle: 'Relatório João Silva',
  hierarchy: [
    {
      name: 'Atividade 1',
      level: 1,
      order: 1,
      purpose: 'Agrupar uma atividade.',
      required: true,
      repeatable: true,
      children: [description1],
    },
    {
      name: 'Atividade 2',
      level: 1,
      order: 4,
      purpose: 'Agrupar uma atividade.',
      required: true,
      repeatable: true,
      children: [description2],
    },
  ],
  sections: [
    {
      name: 'Atividade 1',
      level: 1,
      order: 1,
      purpose: 'Agrupar uma atividade.',
      required: true,
      repeatable: true,
      children: [description1],
    },
    description1,
    {
      name: 'Atividade 2',
      level: 1,
      order: 4,
      purpose: 'Agrupar uma atividade.',
      required: true,
      repeatable: true,
      children: [description2],
    },
    description2,
  ],
  activityPatterns: [
    {
      namePattern: 'atividade {n}',
      sections: ['descricao'],
      order: 1,
      repeatable: true,
      fields: [
        {
          name: 'responsavel',
          label: 'responsável',
          type: 'text',
          required: true,
          evidence: [],
        },
      ],
    },
  ],
  fields: [
    {
      name: 'responsavel',
      label: 'responsável',
      type: 'text',
      required: true,
      evidence: [
        {
          source: 'paragraph',
          elementId: 'p1',
          excerpt: 'Relator: João Silva',
          reason: 'Rótulo reconhecido.',
        },
        {
          source: 'paragraph',
          elementId: 'p2',
          excerpt: 'Relator: Maria',
          reason: 'Rótulo reconhecido.',
        },
      ],
    },
  ],
  recurringElements: [],
  optionalElements: [],
  requiredElements: ['Atividade', 'Descrição'],
}

const profile: WritingStyleProfile = {
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
  rule: 'Descrever o procedimento em ordem cronológica.',
  justification: 'Padrão recorrente.',
  evidence: [],
}
const writing: WritingPattern = {
  globalStyle: profile,
  sectionStyles: [
    {
      ...profile,
      sectionName: 'Descrição',
      introductionPatterns: [],
      developmentPatterns: [],
      conclusionPatterns: [],
    },
  ],
  vocabulary: [{ ...rule, rule: 'procedimento técnico' }],
  terminology: [],
  sentencePatterns: [rule],
  paragraphPatterns: [],
  narrativePatterns: [rule],
  forbiddenPatterns: [{ ...rule, rule: 'linguagem informal' }],
  recommendedPatterns: [rule],
}
const semantic: SemanticPattern = {
  documentType: 'Relatório de sprint',
  sections: [
    {
      sectionName: 'Descrição',
      purpose: 'Registrar o que foi feito e como.',
      expectedInformation: [
        {
          name: 'procedimento',
          description: 'Procedimento executado.',
          informationType: 'procedure',
          required: true,
          evidence: [],
        },
      ],
      excludedInformation: [],
      informationOrder: ['ação', 'procedimento'],
      relationships: [],
      narrativePattern: 'ação e procedimento',
      detailLevel: 'detalhado',
      evidence: [],
    },
  ],
  activityPatterns: [],
  fields: [
    {
      name: 'responsavel',
      label: 'responsável',
      semanticRole: 'Pessoa responsável pela atividade.',
      valueType: 'text',
      required: true,
      evidence: [],
    },
  ],
  crossSectionRelations: [],
  uncertainties: [],
}
const formatting: FormattingPattern = {
  documentStyle: {
    predominantFont: 'Arial',
    predominantFontSizePt: 11,
    sectionFonts: [],
    pageWidthPt: 612,
    pageHeightPt: 792,
    orientation: 'portrait',
    margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
    hasPageNumbering: true,
    pageBreakCount: 0,
    pageBreakBeforeSections: [],
  },
  headingStyles: [
    {
      level: 1,
      sectionNames: ['Atividade 1', 'Atividade 2'],
      sourceStyleId: 'Heading1',
      formatting: {
        ...paragraphFormatting,
        fontSizePt: 16,
        bold: true,
        alignment: 'center',
      },
      evidence: { elementIds: ['h1'], occurrences: 2 },
    },
    {
      level: 2,
      sectionNames: ['Descrição'],
      sourceStyleId: 'Heading2',
      formatting: { ...paragraphFormatting, fontSizePt: 13, bold: true },
      evidence: { elementIds: ['h2'], occurrences: 2 },
    },
  ],
  paragraphStyles: [],
  listStyles: [],
  tableStyles: [],
  figureStyles: [],
  captionStyles: [],
  headerStyles: [],
  footerStyles: [],
  sourceStyleIds: ['Normal', 'Heading1', 'Heading2'],
}

describe('ReportTemplateBuilder.build', () => {
  const structureWithActivityEvidence: StructurePattern = {
    ...structure,
    activityPatterns: structure.activityPatterns.map((activity) => ({
      ...activity,
      fields: activity.fields.map((field) => ({
        ...field,
        evidence: structuredClone(structure.fields[0]?.evidence ?? []),
      })),
    })),
  }
  const writingWithEvidence: WritingPattern = {
    ...writing,
    sectionStyles: writing.sectionStyles.map((section) => ({
      ...section,
      developmentPatterns: [
        {
          rule: 'Descrever o procedimento em ordem cronológica.',
          justification: 'Padrão recorrente.',
          evidence: [
            {
              sectionName: 'Descrição',
              excerpt: 'Descrição da atividade',
              reason: 'A sequência foi observada nas atividades.',
            },
          ],
        },
      ],
    })),
  }
  const semanticWithRelationships: SemanticPattern = {
    ...semantic,
    sections: semantic.sections.map((section) => ({
      ...section,
      relationships: [
        {
          targetSection: 'Resultado',
          relationship: 'A descrição fornece contexto para o resultado.',
          evidence: [
            {
              sectionName: 'Descrição',
              excerpt: 'Descrição da atividade',
              reason: 'A relação foi observada na sequência das seções.',
            },
          ],
        },
      ],
    })),
  }
  const input = {
    document,
    structure: structureWithActivityEvidence,
    writing: writingWithEvidence,
    semantic: semanticWithRelationships,
    formatting,
  }
  const snapshots = {
    structure: structuredClone(structureWithActivityEvidence),
    writing: structuredClone(writingWithEvidence),
    semantic: structuredClone(semanticWithRelationships),
    formatting: structuredClone(formatting),
  }
  const template = new ReportTemplateBuilder().build(input)

  it('preserva profundamente estrutura, campos e atividades', () => {
    expect(template.structurePattern.hierarchy[0]?.children[0]).toEqual(
      expect.objectContaining({
        name: 'Descrição',
        level: 2,
        purpose: 'Descrever a execução.',
      }),
    )
    expect(template.structurePattern.recurringElements).toEqual(
      structure.recurringElements,
    )
    expect(template.fields[0]?.evidence).toEqual(
      structureWithActivityEvidence.fields[0]?.evidence,
    )
    expect(template.activityPatterns[0]).toEqual(
      expect.objectContaining({
        namePattern: 'atividade {n}',
        sections: ['descricao'],
        repeatable: true,
        fields: [
          expect.objectContaining({
            name: 'responsavel',
            evidence: structureWithActivityEvidence.fields[0]?.evidence,
          }),
        ],
      }),
    )
  })

  it('preserva regras de escrita, justificativas e evidências como objetos', () => {
    expect(
      template.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toEqual({
      rule: 'Descrever o procedimento em ordem cronológica.',
      justification: 'Padrão recorrente.',
      evidence: [
        {
          sectionName: 'Descrição',
          excerpt: 'Descrição da atividade',
          reason: 'A sequência foi observada nas atividades.',
        },
      ],
    })
    expect(template.writingPattern.globalStyle).toMatchObject({
      grammaticalPerson: 'terceira pessoa',
      verbTense: 'pretérito',
      voice: 'passiva',
      narrativeStyle: 'procedimental',
    })
    expect(
      typeof template.writingPattern.sectionStyles[0]?.developmentPatterns[0],
    ).toBe('object')
  })

  it('preserva finalidade, informações esperadas e relações semânticas', () => {
    expect(
      template.semanticPattern.sections[0]?.expectedInformation[0],
    ).toEqual(
      expect.objectContaining({
        name: 'procedimento',
        informationType: 'procedure',
        required: true,
        evidence: [],
      }),
    )
    expect(template.semanticPattern.sections[0]?.relationships[0]).toEqual({
      targetSection: 'Resultado',
      relationship: 'A descrição fornece contexto para o resultado.',
      evidence: [
        {
          sectionName: 'Descrição',
          excerpt: 'Descrição da atividade',
          reason: 'A relação foi observada na sequência das seções.',
        },
      ],
    })
    expect(typeof template.semanticPattern.sections[0]).not.toBe('string')
  })

  it('preserva propriedades completas de formatação e suas evidências', () => {
    expect(template.formattingPattern.documentStyle).toMatchObject({
      predominantFont: 'Arial',
      predominantFontSizePt: 11,
      orientation: 'portrait',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
    })
    expect(template.formattingPattern.headingStyles[0]).toEqual(
      expect.objectContaining({
        sourceStyleId: 'Heading1',
        formatting: expect.objectContaining({
          fontSizePt: 16,
          bold: true,
          alignment: 'center',
        }),
        evidence: { elementIds: ['h1'], occurrences: 2 },
      }),
    )
    expect(typeof template.formattingPattern.headingStyles[0]).toBe('object')
  })

  it('mapeia somente requisitos comprovados pela análise estrutural', () => {
    expect(template.requirements).toEqual({
      requiredElements: ['Atividade', 'Descrição'],
      optionalElements: [],
      repeatableElements: ['Atividade 1', 'Atividade 2', 'atividade {n}'],
    })
  })

  it('gera a versão oficial e metadados sem números mágicos', () => {
    expect(template.version).toBe(REPORT_TEMPLATE_VERSION)
    expect(template.metadata).toMatchObject({
      id: expect.any(String),
      name: 'Modelo de Relatório de sprint',
      description:
        'Padrão reutilizável aprendido a partir de um único documento do tipo Relatório de sprint.',
      documentType: 'Relatório de sprint',
      status: 'draft',
    })
    expect(template.metadata.id).not.toBe('')
    expect(Number.isNaN(Date.parse(template.metadata.createdAt))).toBe(false)
    expect(template.metadata.updatedAt).toBe(template.metadata.createdAt)
  })

  it('não modifica nem compartilha referências mutáveis com as análises', () => {
    expect(input.structure).toEqual(snapshots.structure)
    expect(input.writing).toEqual(snapshots.writing)
    expect(input.semantic).toEqual(snapshots.semantic)
    expect(input.formatting).toEqual(snapshots.formatting)

    expect(template.structurePattern).not.toBe(input.structure)
    expect(template.writingPattern).not.toBe(input.writing)
    expect(template.semanticPattern).not.toBe(input.semantic)
    expect(template.formattingPattern).not.toBe(input.formatting)
    expect(template.fields).not.toBe(input.structure.fields)
    expect(template.activityPatterns).not.toBe(input.structure.activityPatterns)
  })
})
