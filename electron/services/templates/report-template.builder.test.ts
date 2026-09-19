import { describe, expect, it } from 'vitest'
import type { FormattingPattern } from '../documents/formatting-analysis.types'
import type { SemanticPattern } from '../documents/semantic-analysis.types'
import type { StructurePattern } from '../documents/structure-analysis.types'
import type {
  DocumentRepresentation,
  ParagraphFormatting,
} from '../documents/types'
import type {
  WritingPattern,
  WritingStyleProfile,
} from '../documents/writing-analysis.types'
import { ReportTemplateBuilder } from './report-template.builder'

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

describe('ReportTemplateBuilder', () => {
  const template = new ReportTemplateBuilder().build({
    document,
    structure,
    writing,
    semantic,
    formatting,
  })

  it('constrói um rascunho completo e reutilizável', () => {
    expect(template).toMatchObject({
      name: 'Modelo de Relatório de sprint',
      documentType: 'Relatório de sprint',
      status: 'draft',
      tone: 'técnico',
      style: 'procedimental',
      formality: 'high',
    })
    expect(template.fields[0]).toMatchObject({
      name: 'responsavel',
      label: 'responsável',
      required: true,
      description: 'Pessoa responsável pela atividade.',
    })
    expect(template.writingRules).toContain(
      'Descrever o procedimento em ordem cronológica.',
    )
    expect(template.semanticRules).toContain(
      'Descrição: Registrar o que foi feito e como.',
    )
    expect(template.formattingRules).toContain(
      'Utilizar predominantemente a fonte Arial.',
    )
  })

  it('consolida ocorrências em uma hierarquia e atividade repetível', () => {
    expect(template.sections.map((section) => section.name)).toEqual([
      'Atividade',
      'Descrição',
    ])
    expect(template.sections.every((section) => section.repeatable)).toBe(true)
    expect(template.hierarchy).toHaveLength(1)
    expect(template.hierarchy?.[0]?.children).toHaveLength(1)
    expect(template.activityPatterns).toEqual([
      expect.objectContaining({
        namePattern: 'atividade {n}',
        sectionNames: ['descricao'],
        repeatable: true,
        fieldIds: [template.fields[0]?.id],
      }),
    ])
  })

  it('não armazena valores específicos do documento original', () => {
    const serialized = JSON.stringify(template)
    expect(serialized).not.toContain('João Silva')
    expect(serialized).not.toContain('Maria')
    expect(serialized).not.toContain('Atividade 1')
    expect(serialized).not.toContain('Atividade 2')
    expect(serialized).not.toContain('Atividade X')
  })
})
