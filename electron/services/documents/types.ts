import type { ParagraphFormatting } from '../../../src/domain/templates/formatting-pattern'

export type {
  ParagraphFormatting,
  TextFormatting,
} from '../../../src/domain/templates/formatting-pattern'

export type DocumentFileType = 'docx' | 'txt'
export interface ExtractedSection {
  id: string
  title: string
  level: number
  order: number
  content: string
  parentSectionId: string | null
}
export interface ExtractedParagraph {
  id: string
  text: string
  order: number
  style: 'heading' | 'paragraph' | 'list-item' | 'caption'
  headingLevel: number | null
  sectionId: string | null
  numbering: { numberId: string; level: number } | null
  formatting: ParagraphFormatting
  pageBreakBefore: boolean
}
export interface ExtractedHeading {
  id: string
  paragraphId: string
  title: string
  level: number
  order: number
  sectionId: string
}
export interface ExtractedListItem {
  id: string
  paragraphId: string
  text: string
  level: number
  order: number
}
export interface ExtractedList {
  id: string
  order: number
  numberId: string
  ordered: boolean | null
  format: string | null
  start: number | null
  styleId: string | null
  items: ExtractedListItem[]
}
export interface ExtractedTable {
  id: string
  order: number
  rowCount: number
  columnCount: number
  rows: string[][]
  headerRows: number
  styleId: string | null
  alignment: string | null
  sectionId: string | null
}
export interface ExtractedFigure {
  id: string
  index: number
  order: number
  relationshipId: string
  fileName: string | null
  contentType: string | null
  caption: string | null
  sectionId: string | null
  previousParagraphId: string | null
  nextParagraphId: string | null
}
export interface DocumentHeaderFooter {
  id: string
  type: 'header' | 'footer'
  variant: 'default' | 'first' | 'even' | 'unknown'
  text: string
  paragraphs: string[]
  formatting?: ParagraphFormatting[]
}
export interface PageInformation {
  widthPt: number | null
  heightPt: number | null
  orientation: 'portrait' | 'landscape' | null
  margins: {
    topPt: number | null
    rightPt: number | null
    bottomPt: number | null
    leftPt: number | null
  }
  pageBreakCount: number
  hasPageNumbering: boolean
}
export interface DocumentStyle {
  id: string
  name: string
  type: string
  basedOn: string | null
  isDefault: boolean
  formatting: Partial<ParagraphFormatting>
}
export interface DocumentElementReference {
  id: string
  type:
    'paragraph' | 'heading' | 'list-item' | 'table' | 'figure' | 'page-break'
  order: number
}
export interface DocumentMetadata {
  fileSize: number
  extractedAt: string
  title: string | null
  author: string | null
  createdAt: string | null
  modifiedAt: string | null
}
export interface DocumentRepresentation {
  fileName: string
  fileType: DocumentFileType
  text: string
  metadata: DocumentMetadata
  elements: DocumentElementReference[]
  paragraphs: ExtractedParagraph[]
  sections: ExtractedSection[]
  headings: ExtractedHeading[]
  lists: ExtractedList[]
  tables: ExtractedTable[]
  figures: ExtractedFigure[]
  headers: DocumentHeaderFooter[]
  footers: DocumentHeaderFooter[]
  pageInformation: PageInformation
  formatting: { defaultParagraph: Partial<ParagraphFormatting> }
  styles: DocumentStyle[]
}
export type ExtractedDocument = DocumentRepresentation
export interface DocumentExtractor {
  extract(filePath: string): Promise<DocumentRepresentation>
}
