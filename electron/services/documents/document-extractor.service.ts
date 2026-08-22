import { access } from 'node:fs/promises'
import path from 'node:path'
import { DocumentExtractionError } from './document-errors'
import { DocxExtractor } from './docx-extractor.service'
import { TxtExtractor } from './txt-extractor.service'
import type { DocumentExtractor, ExtractedDocument } from './types'

export class DocumentExtractorService implements DocumentExtractor {
  constructor(
    private readonly docxExtractor = new DocxExtractor(),
    private readonly txtExtractor = new TxtExtractor(),
  ) {}

  async extract(filePath: string): Promise<ExtractedDocument> {
    try {
      await access(filePath)
    } catch {
      throw new DocumentExtractionError(
        'FILE_NOT_FOUND',
        'O arquivo selecionado não foi encontrado.',
      )
    }

    const extension = path.extname(filePath).toLowerCase()
    if (extension === '.docx') return this.docxExtractor.extract(filePath)
    if (extension === '.txt') return this.txtExtractor.extract(filePath)
    throw new DocumentExtractionError(
      'UNSUPPORTED_FORMAT',
      'Formato não suportado. Selecione um arquivo DOCX ou TXT.',
    )
  }
}
