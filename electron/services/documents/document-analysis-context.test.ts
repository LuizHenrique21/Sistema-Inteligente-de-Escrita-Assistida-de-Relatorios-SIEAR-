import { describe, expect, it } from 'vitest'
import type { SemanticPattern, StructurePattern } from '../../../src/domain/templates'
import { createDocumentAnalysisContext } from './document-analysis-context'
import type { DocumentRepresentation } from './types'

const document: DocumentRepresentation = {
  fileName: 'modelo.docx',
  fileType: 'docx',
  text: 'Relatório técnico.',
  metadata: {
    fileSize: 100,
    extractedAt: '2026-08-24T00:00:00.000Z',
    title: 'Relatório',
    author: null,
    createdAt: null,
    modifiedAt: null,
  },
  elements: [],
  paragraphs: [
    {
      id: 'p1',
      text: 'Equipamento: Nobreak',
      order: 1,
      style: 'paragraph',
      headingLevel: null,
      sectionId: 's1',
      numbering: null,
      formatting: {
        fontFamily: 'Arial',
        fontSizePt: 11,
        bold: false,
        italic: false,
        underline: false,
        alignment: null,
        lineSpacing: null,
        spaceBeforePt: null,
        spaceAfterPt: null,
        indentLeftPt: null,
        indentRightPt: null,
        firstLineIndentPt: null,
        styleId: 'normal',
      },
      pageBreakBefore: false,
    },
  ],
  sections: [
    {
      id: 's1',
      title: 'Descrição',
      level: 1,
      order: 1,
      content: 'Equipamento: Nobreak',
      parentSectionId: null,
    },
  ],
  headings: [],
  lists: [],
  tables: [],
  figures: [],
  headers: [],
  footers: [],
  pageInformation: {
    widthPt: null,
    heightPt: null,
    orientation: null,
    margins: { topPt: null, rightPt: null, bottomPt: null, leftPt: null },
    pageBreakCount: 0,
    hasPageNumbering: false,
  },
  formatting: { defaultParagraph: {} },
  styles: [
    {
      id: 'normal',
      name: 'Normal',
      type: 'paragraph',
      basedOn: null,
      isDefault: true,
      formatting: { fontFamily: 'Arial' },
    },
  ],
}

const structure: StructurePattern = {
  documentType: 'Relatório',
  mainTitle: 'Relatório',
  hierarchy: [],
  sections: [
    {
      name: 'Descrição',
      level: 1,
      order: 1,
      purpose: 'Descrever.',
      required: true,
      repeatable: false,
      children: [],
    },
  ],
  activityPatterns: [
    {
      namePattern: 'atividade {n}',
      sections: ['Descrição'],
      order: 1,
      repeatable: true,
      fields: [],
    },
  ],
  fields: [
    {
      name: 'equipamento',
      label: 'Equipamento',
      type: 'text',
      required: true,
      evidence: [
        {
          source: 'paragraph',
          elementId: 'p1',
          excerpt: 'Equipamento: Nobreak',
          reason: 'Campo em parágrafo.',
        },
      ],
    },
  ],
  recurringElements: [],
  optionalElements: [],
  requiredElements: ['Descrição'],
}

const semantic: SemanticPattern = {
  documentType: 'Relatório',
  sections: [
    {
      sectionName: 'Descrição',
      purpose: 'Descrever.',
      expectedInformation: [],
      excludedInformation: [],
      informationOrder: [],
      relationships: [
        {
          targetSection: 'Descrição',
          relationship: 'auto referência',
          evidence: [],
        },
      ],
      narrativePattern: 'técnico',
      detailLevel: 'objetivo',
      evidence: [],
    },
  ],
  activityPatterns: [],
  fields: [],
  crossSectionRelations: [
    {
      targetSection: 'Descrição',
      relationship: 'relaciona',
      evidence: [],
    },
  ],
  uncertainties: [],
}

describe('DocumentAnalysisContext', () => {
  it('mantém índices imutáveis e resolve IDs compartilhados pelos analyzers', () => {
    const context = createDocumentAnalysisContext(document, {
      structure,
      semantic,
    })

    expect(Object.isFrozen(context)).toBe(true)
    expect(context.paragraphById.get('p1')).toBe(document.paragraphs[0])
    expect(context.sectionById.get('s1')).toBe(document.sections[0])
    expect(context.styleById.get('normal')).toBe(document.styles[0])
    expect(context.fieldById.get('equipamento')).toBe(structure.fields[0])
    expect([...context.activityById.values()]).toContain(
      structure.activityPatterns[0],
    )
    expect([...context.relationshipById.values()]).toEqual([
      semantic.sections[0]!.relationships[0],
      semantic.crossSectionRelations[0],
    ])
  })
})
