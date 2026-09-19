import type { ParagraphFormatting } from './types'

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
