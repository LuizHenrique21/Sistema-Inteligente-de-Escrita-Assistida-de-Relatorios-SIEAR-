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
      })
      if (isHeading) {
        currentSection = {
          id: randomUUID(),
          title: value.replace(/^\d+(?:\.\d+)*[.)]?\s+/, ''),
          level: 1,
          order: sections.length + 1,
          content: '',
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
      sections,
      paragraphs,
      tables: [],
      metadata: { fileSize: file.size, extractedAt: new Date().toISOString() },
    }
  }
}
