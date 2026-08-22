import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import mammoth from 'mammoth'
import { DocumentExtractionError } from './document-errors'
import type {
  DocumentExtractor,
  ExtractedDocument,
  ExtractedSection,
  ExtractedTable,
} from './types'

function textFromHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function extractTables(html: string): ExtractedTable[] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(
    (tableMatch, tableIndex) => ({
      id: randomUUID(),
      order: tableIndex + 1,
      rows: [
        ...(tableMatch[1] ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
      ].map((rowMatch) =>
        [
          ...(rowMatch[1] ?? '').matchAll(
            /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi,
          ),
        ].map((cellMatch) => textFromHtml(cellMatch[1] ?? '')),
      ),
    }),
  )
}

export class DocxExtractor implements DocumentExtractor {
  async extract(filePath: string): Promise<ExtractedDocument> {
    const [conversion, file] = await Promise.all([
      mammoth.convertToHtml({ path: filePath }),
      stat(filePath),
    ])
    const html = conversion.value
    const paragraphs: ExtractedDocument['paragraphs'] = []
    const sections: ExtractedSection[] = []
    let currentSection: ExtractedSection | null = null

    for (const match of html.matchAll(
      /<(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    )) {
      const tag = (match[1] ?? 'p').toLowerCase()
      const text = textFromHtml(match[2] ?? '')
      if (!text) continue
      const headingLevel = tag.startsWith('h') ? Number(tag[1]) : null
      paragraphs.push({
        id: randomUUID(),
        text,
        order: paragraphs.length + 1,
        style: headingLevel
          ? 'heading'
          : tag === 'li'
            ? 'list-item'
            : 'paragraph',
        headingLevel,
      })
      if (headingLevel) {
        currentSection = {
          id: randomUUID(),
          title: text,
          level: headingLevel,
          order: sections.length + 1,
          content: '',
        }
        sections.push(currentSection)
      } else if (currentSection) {
        currentSection.content = [currentSection.content, text]
          .filter(Boolean)
          .join('\n')
      }
    }

    const text = paragraphs.map((paragraph) => paragraph.text).join('\n')
    if (!text.trim()) {
      throw new DocumentExtractionError(
        'EMPTY_DOCUMENT',
        'O documento está vazio.',
      )
    }

    return {
      fileName: path.basename(filePath),
      fileType: 'docx',
      text,
      sections,
      paragraphs,
      tables: extractTables(html),
      metadata: { fileSize: file.size, extractedAt: new Date().toISOString() },
    }
  }
}
