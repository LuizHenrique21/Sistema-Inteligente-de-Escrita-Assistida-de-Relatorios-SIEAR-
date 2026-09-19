import { access } from 'node:fs/promises'
import path from 'node:path'
import { DocumentExtractionError } from './document-errors'
import { DocxExtractor } from './docx-extractor.service'
import { TxtExtractor } from './txt-extractor.service'
import type { DocumentExtractor, ExtractedDocument } from './types'
import { getLogger } from '../../infrastructure/logging/logger.runtime'
import { serializeError } from '../../infrastructure/logging/log-sanitizer'

const logger = getLogger('DocumentExtractorService')

export const DOCUMENT_EXTRACTION_ANALYZER_VERSION = '1' as const
export const DOCUMENT_REPRESENTATION_STAGE_VERSION = '1' as const

export class DocumentExtractorService implements DocumentExtractor {
  constructor(
    private readonly docxExtractor = new DocxExtractor(),
    private readonly txtExtractor = new TxtExtractor(),
  ) {}

  async extract(filePath: string): Promise<ExtractedDocument> {
    const extension = path.extname(filePath).toLowerCase()
    const timer = logger.startTimer('Document extraction', { extension })
    logger.info('Document extraction started', { extension })
    try {
      await access(filePath)
    } catch (error: unknown) {
      logger.error('Document extraction failed', {
        extension,
        error: serializeError(error),
      })
      throw new DocumentExtractionError(
        'FILE_NOT_FOUND',
        'O arquivo selecionado não foi encontrado.',
      )
    }

    let result: ExtractedDocument
    if (extension === '.docx')
      result = await this.docxExtractor.extract(filePath)
    else if (extension === '.txt')
      result = await this.txtExtractor.extract(filePath)
    else {
      logger.warn('Document format rejected', { extension })
      throw new DocumentExtractionError(
        'UNSUPPORTED_FORMAT',
        'Formato não suportado. Selecione um arquivo DOCX ou TXT.',
      )
    }
    timer.end('Document extraction completed', {
      extension,
      sections: result.sections.length,
      paragraphs: result.paragraphs.length,
      tables: result.tables.length,
      figures: result.figures.length,
    })
    return result
  }
}
