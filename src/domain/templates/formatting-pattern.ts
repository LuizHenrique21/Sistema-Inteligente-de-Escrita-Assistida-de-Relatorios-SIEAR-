export interface TextFormatting {
  fontFamily: string | null
  fontSizePt: number | null
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface ParagraphFormatting extends TextFormatting {
  alignment: string | null
  lineSpacing: number | null
  spaceBeforePt: number | null
  spaceAfterPt: number | null
  indentLeftPt: number | null
  indentRightPt: number | null
  firstLineIndentPt: number | null
  styleId: string | null
}

export interface FormattingEvidence {
  elementIds: string[]
  occurrences: number
}

export interface DocumentStyle {
  predominantFont: string | null
  predominantFontSizePt: number | null
  sectionFonts: Array<{
    sectionName: string
    fontFamily: string | null
    fontSizePt: number | null
  }>
  pageWidthPt: number | null
  pageHeightPt: number | null
  orientation: 'portrait' | 'landscape' | null
  margins: {
    topPt: number | null
    rightPt: number | null
    bottomPt: number | null
    leftPt: number | null
  }
  hasPageNumbering: boolean
  pageBreakCount: number
  pageBreakBeforeSections: string[]
}

export interface HeadingStyle {
  level: number
  sectionNames: string[]
  sourceStyleId: string | null
  formatting: ParagraphFormatting
  evidence: FormattingEvidence
}

export interface ParagraphStyle {
  sectionName: string | null
  sourceStyleId: string | null
  formatting: ParagraphFormatting
  evidence: FormattingEvidence
}

export interface ListStyle {
  sourceStyleId: string | null
  ordered: boolean | null
  format: string | null
  start: number | null
  levels: number[]
  itemFormatting: ParagraphFormatting | null
  evidence: FormattingEvidence
}

export interface TableStyle {
  sourceStyleId: string | null
  alignment: string | null
  headerRows: number
  rowCount: number
  columnCount: number
  evidence: FormattingEvidence
}

export interface FigureStyle {
  contentType: string | null
  hasCaption: boolean
  sectionName: string | null
  evidence: FormattingEvidence
}

export interface CaptionStyle {
  sourceStyleId: string | null
  formatting: ParagraphFormatting
  evidence: FormattingEvidence
}

export interface HeaderStyle {
  variant: 'default' | 'first' | 'even' | 'unknown'
  paragraphCount: number
  text: string
  formatting: ParagraphFormatting | null
  evidence: FormattingEvidence
}

export interface FooterStyle {
  variant: 'default' | 'first' | 'even' | 'unknown'
  paragraphCount: number
  text: string
  containsPageNumber: boolean
  formatting: ParagraphFormatting | null
  evidence: FormattingEvidence
}

/**
 * Padrão visual atualmente aprendido pelo SIEAR.
 *
 * O contrato preserva a capacidade existente e, nesta versão, não descreve
 * bordas/células mescladas em detalhe, posicionamento avançado de imagens,
 * numeração multinível completa, temas nem field codes.
 */
export interface FormattingPattern {
  documentStyle: DocumentStyle
  headingStyles: HeadingStyle[]
  paragraphStyles: ParagraphStyle[]
  listStyles: ListStyle[]
  tableStyles: TableStyle[]
  figureStyles: FigureStyle[]
  captionStyles: CaptionStyle[]
  headerStyles: HeaderStyle[]
  footerStyles: FooterStyle[]
  sourceStyleIds: string[]
}
