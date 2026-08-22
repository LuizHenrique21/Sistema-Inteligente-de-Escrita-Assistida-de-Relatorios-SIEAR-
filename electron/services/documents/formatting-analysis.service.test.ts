import { describe, expect, it } from 'vitest'
import { FormattingAnalysisService } from './formatting-analysis.service'
import type {
  DocumentRepresentation,
  ExtractedParagraph,
  ParagraphFormatting,
} from './types'

const base: ParagraphFormatting = {
  fontFamily: null,
  fontSizePt: null,
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
  styleId: null,
}

function paragraph(
  id: string,
  text: string,
  style: ExtractedParagraph['style'],
  formatting: Partial<ParagraphFormatting>,
  options: {
    sectionId?: string
    headingLevel?: number
    numbering?: { numberId: string; level: number }
  } = {},
): ExtractedParagraph {
  return {
    id,
    text,
    order: Number(id.replace(/\D/g, '')) || 1,
    style,
    headingLevel: options.headingLevel ?? null,
    sectionId: options.sectionId ?? null,
    numbering: options.numbering ?? null,
    formatting: { ...base, ...formatting },
    pageBreakBefore: false,
  }
}

function fixture(): DocumentRepresentation {
  return {
    fileName: 'modelo.docx',
    fileType: 'docx',
    text: 'Relatório técnico',
    metadata: {
      fileSize: 1000,
      extractedAt: '2026-08-21T00:00:00.000Z',
      title: 'Relatório',
      author: null,
      createdAt: null,
      modifiedAt: null,
    },
    elements: [],
    paragraphs: [
      paragraph(
        'p1',
        'Título principal',
        'heading',
        { styleId: 'Heading1' },
        { sectionId: 's1', headingLevel: 1 },
      ),
      paragraph(
        'p2',
        'Texto técnico detalhado com várias palavras em fonte Arial.',
        'paragraph',
        {
          fontFamily: 'Arial',
          fontSizePt: 11,
          alignment: 'justify',
          lineSpacing: 1.15,
          spaceAfterPt: 6,
          firstLineIndentPt: 18,
        },
        { sectionId: 's1' },
      ),
      paragraph(
        'p3',
        'Subtítulo',
        'heading',
        { styleId: 'Heading2' },
        { sectionId: 's2', headingLevel: 2 },
      ),
      paragraph(
        'p4',
        'Texto curto.',
        'paragraph',
        { fontFamily: 'Calibri', fontSizePt: 10 },
        { sectionId: 's2' },
      ),
      paragraph(
        'p5',
        'Item numerado',
        'list-item',
        {
          styleId: 'ListParagraph',
          fontFamily: 'Arial',
          fontSizePt: 11,
          indentLeftPt: 36,
        },
        { sectionId: 's2', numbering: { numberId: '1', level: 0 } },
      ),
      paragraph(
        'p6',
        'Figura 1 — Equipamento',
        'caption',
        {
          styleId: 'Caption',
          fontFamily: 'Arial',
          fontSizePt: 9,
          italic: true,
          alignment: 'center',
        },
        { sectionId: 's2' },
      ),
    ],
    sections: [
      {
        id: 's1',
        title: 'Título principal',
        level: 1,
        order: 1,
        content: '',
        parentSectionId: null,
      },
      {
        id: 's2',
        title: 'Subtítulo',
        level: 2,
        order: 2,
        content: '',
        parentSectionId: 's1',
      },
    ],
    headings: [],
    lists: [
      {
        id: 'list1',
        order: 5,
        numberId: '1',
        ordered: true,
        format: 'decimal',
        start: 1,
        styleId: 'ListParagraph',
        items: [
          {
            id: 'li1',
            paragraphId: 'p5',
            text: 'Item numerado',
            level: 0,
            order: 1,
          },
        ],
      },
    ],
    tables: [
      {
        id: 'table1',
        order: 6,
        rowCount: 3,
        columnCount: 2,
        rows: [
          ['Campo', 'Valor'],
          ['A', 'B'],
          ['C', 'D'],
        ],
        headerRows: 1,
        styleId: 'TableGrid',
        alignment: 'center',
        sectionId: 's2',
      },
    ],
    figures: [
      {
        id: 'figure1',
        index: 1,
        order: 7,
        relationshipId: 'rImage1',
        fileName: 'image1.png',
        contentType: 'image/png',
        caption: 'Figura 1 — Equipamento',
        sectionId: 's2',
        previousParagraphId: 'p5',
        nextParagraphId: 'p6',
      },
    ],
    headers: [
      {
        id: 'header1',
        type: 'header',
        variant: 'default',
        text: 'SIEAR',
        paragraphs: ['SIEAR'],
        formatting: [
          { ...base, fontFamily: 'Arial', fontSizePt: 9, alignment: 'center' },
        ],
      },
    ],
    footers: [
      {
        id: 'footer1',
        type: 'footer',
        variant: 'default',
        text: 'Página PAGE',
        paragraphs: ['Página PAGE'],
        formatting: [
          { ...base, fontFamily: 'Arial', fontSizePt: 9, alignment: 'center' },
        ],
      },
    ],
    pageInformation: {
      widthPt: 612,
      heightPt: 792,
      orientation: 'portrait',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
      pageBreakCount: 2,
      hasPageNumbering: true,
    },
    formatting: {
      defaultParagraph: {
        fontFamily: 'Arial',
        fontSizePt: 11,
        alignment: 'left',
        lineSpacing: 1,
      },
    },
    styles: [
      {
        id: 'Normal',
        name: 'Normal',
        type: 'paragraph',
        basedOn: null,
        isDefault: true,
        formatting: { fontFamily: 'Arial', fontSizePt: 11 },
      },
      {
        id: 'Heading1',
        name: 'Título 1',
        type: 'paragraph',
        basedOn: 'Normal',
        isDefault: false,
        formatting: {
          fontSizePt: 16,
          bold: true,
          alignment: 'center',
          spaceBeforePt: 12,
          spaceAfterPt: 6,
        },
      },
      {
        id: 'Heading2',
        name: 'Título 2',
        type: 'paragraph',
        basedOn: 'Heading1',
        isDefault: false,
        formatting: { fontSizePt: 13, alignment: 'left' },
      },
      {
        id: 'Caption',
        name: 'Legenda',
        type: 'paragraph',
        basedOn: 'Normal',
        isDefault: false,
        formatting: { fontSizePt: 9, italic: true },
      },
    ],
  }
}

describe('FormattingAnalysisService', () => {
  it('identifica fonte predominante, fontes por seção e propriedades da página', () => {
    const result = new FormattingAnalysisService().analyze(fixture())
    expect(result.documentStyle).toMatchObject({
      predominantFont: 'Arial',
      predominantFontSizePt: 11,
      orientation: 'portrait',
      pageWidthPt: 612,
      pageHeightPt: 792,
      hasPageNumbering: true,
      pageBreakCount: 2,
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
    })
    expect(result.documentStyle.sectionFonts).toContainEqual({
      sectionName: 'Título principal',
      fontFamily: 'Arial',
      fontSizePt: 11,
    })
  })

  it('resolve herança e cria estilos reutilizáveis para títulos, parágrafos e legendas', () => {
    const result = new FormattingAnalysisService().analyze(fixture())
    expect(result.headingStyles[0]).toMatchObject({
      level: 1,
      sourceStyleId: 'Heading1',
      formatting: {
        fontFamily: 'Arial',
        fontSizePt: 16,
        bold: true,
        alignment: 'center',
      },
    })
    expect(result.headingStyles[1]).toMatchObject({
      level: 2,
      formatting: { fontSizePt: 13, bold: true, alignment: 'left' },
    })
    expect(result.paragraphStyles).toContainEqual(
      expect.objectContaining({
        sectionName: 'Título principal',
        formatting: expect.objectContaining({
          alignment: 'justify',
          lineSpacing: 1.15,
          firstLineIndentPt: 18,
        }),
      }),
    )
    expect(result.captionStyles[0]).toMatchObject({
      sourceStyleId: 'Caption',
      formatting: { fontSizePt: 9, italic: true, alignment: 'center' },
    })
  })

  it('preserva propriedades de listas, tabelas, figuras, cabeçalho e rodapé', () => {
    const result = new FormattingAnalysisService().analyze(fixture())
    expect(result.listStyles[0]).toMatchObject({
      ordered: true,
      format: 'decimal',
      start: 1,
      levels: [0],
      itemFormatting: { indentLeftPt: 36 },
    })
    expect(result.tableStyles[0]).toMatchObject({
      sourceStyleId: 'TableGrid',
      alignment: 'center',
      headerRows: 1,
      rowCount: 3,
      columnCount: 2,
    })
    expect(result.figureStyles[0]).toMatchObject({
      contentType: 'image/png',
      hasCaption: true,
      sectionName: 'Subtítulo',
    })
    expect(result.headerStyles[0]).toMatchObject({
      variant: 'default',
      text: 'SIEAR',
      formatting: { fontFamily: 'Arial', fontSizePt: 9, alignment: 'center' },
    })
    expect(result.footerStyles[0]).toMatchObject({
      text: 'Página PAGE',
      containsPageNumber: true,
      formatting: { fontFamily: 'Arial', fontSizePt: 9, alignment: 'center' },
    })
    expect(result.sourceStyleIds).toEqual([
      'Normal',
      'Heading1',
      'Heading2',
      'Caption',
    ])
  })

  it('retorna padrões vazios e valores nulos quando a informação não está disponível', () => {
    const document = fixture()
    document.paragraphs = []
    document.sections = []
    document.lists = []
    document.tables = []
    document.figures = []
    document.headers = []
    document.footers = []
    document.styles = []
    document.formatting = { defaultParagraph: {} }
    document.pageInformation = {
      widthPt: null,
      heightPt: null,
      orientation: null,
      margins: { topPt: null, rightPt: null, bottomPt: null, leftPt: null },
      pageBreakCount: 0,
      hasPageNumbering: false,
    }
    const result = new FormattingAnalysisService().analyze(document)
    expect(result.documentStyle).toMatchObject({
      predominantFont: null,
      predominantFontSizePt: null,
      orientation: null,
    })
    expect(result.headingStyles).toEqual([])
    expect(result.headerStyles).toEqual([])
  })
})
