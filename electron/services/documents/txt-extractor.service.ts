import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DocumentExtractionError } from './document-errors'
import type {
  DocumentExtractor,
  ExtractedDocument,
  ExtractedSection,
} from './types'

const HEADING_PATTERN =
  /^(?:\d+(?:\.\d+)*[.)]?\s+)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s\-–—:]{2,}$/u

export class TxtExtractor implements DocumentExtractor {
  async extract(filePath: string): Promise<ExtractedDocument> {
    const [text, file] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ])
    if (text.trim() === '') {
      throw new DocumentExtractionError(
        'EMPTY_DOCUMENT',
        'O documento está vazio.',
      )
    }

    const lines = text.split(/\r?\n/)
    const sections: ExtractedSection[] = []
    const paragraphs: ExtractedDocument['paragraphs'] = []
    let currentSection: ExtractedSection | null = null

    for (const line of lines) {
      const value = line.trim()
      if (!value) continue
      const isHeading = HEADING_PATTERN.test(value) && value.length <= 120
      paragraphs.push({
        id: randomUUID(),
        text: value,
        order: paragraphs.length + 1,
        style: isHeading ? 'heading' : 'paragraph',
        headingLevel: isHeading ? 1 : null,
        sectionId: currentSection?.id ?? null,
        numbering: null,
        formatting: {
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
        },
        pageBreakBefore: false,
      })
      if (isHeading) {
        currentSection = {
          id: randomUUID(),
          title: value.replace(/^\d+(?:\.\d+)*[.)]?\s+/, ''),
          level: 1,
          order: sections.length + 1,
          content: '',
          parentSectionId: null,
        }
        sections.push(currentSection)
      } else if (currentSection) {
        currentSection.content = [currentSection.content, value]
          .filter(Boolean)
          .join('\n')
      }
    }

    return {
      fileName: path.basename(filePath),
      fileType: 'txt',
      text: text.trim(),
      elements: paragraphs.map((paragraph) => ({
        id: paragraph.id,
        type: paragraph.style === 'heading' ? 'heading' : 'paragraph',
        order: paragraph.order,
      })),
      sections,
      paragraphs,
      headings: sections.map((section) => {
        const paragraph = paragraphs.find(
          (item) =>
            item.headingLevel === section.level &&
            item.text.includes(section.title),
        )
        return {
          id: randomUUID(),
          paragraphId: paragraph?.id ?? '',
          title: section.title,
          level: section.level,
          order: section.order,
          sectionId: section.id,
        }
      }),
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
      styles: [],
      metadata: {
        fileSize: file.size,
        extractedAt: new Date().toISOString(),
        title: null,
        author: null,
        createdAt: null,
        modifiedAt: null,
      },
    }
  }
}
