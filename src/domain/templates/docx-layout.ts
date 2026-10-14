/** Original OOXML appearance with sample body text removed. */
export interface DocxParagraphLayout {
  properties: string
  runProperties: string
}

export interface DocxReportSectionLayout {
  name: string
  sourceSectionName: string
  heading: DocxParagraphLayout
  paragraph: DocxParagraphLayout
  sampleWords: number
}

export interface DocxReportLayout {
  version: 1
  /** Sanitized package: styles, theme, numbering, headers/footers and their media. */
  packageBase64: string
  title: { text: string; layout: DocxParagraphLayout } | null
  sections: DocxReportSectionLayout[]
  collection: {
    instances: number
    detection: 'repeated-section-sequence'
  } | null
}
