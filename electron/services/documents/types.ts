export type DocumentFileType = 'docx' | 'txt'

export interface ExtractedSection {
  id: string
  title: string
  level: number
  order: number
  content: string
}

export interface ExtractedParagraph {
  id: string
  text: string
  order: number
  style: 'heading' | 'paragraph' | 'list-item'
  headingLevel: number | null
}

export interface ExtractedTable {
  id: string
  order: number
  rows: string[][]
}

export interface DocumentMetadata {
  fileSize: number
  extractedAt: string
}

export interface ExtractedDocument {
  fileName: string
  fileType: DocumentFileType
  text: string
  sections: ExtractedSection[]
  paragraphs: ExtractedParagraph[]
  tables: ExtractedTable[]
  metadata: DocumentMetadata
}

export interface DocumentExtractor {
  extract(filePath: string): Promise<ExtractedDocument>
}
