export class DocumentExtractionError extends Error {
  constructor(
    public readonly code:
      | 'FILE_NOT_FOUND'
      | 'UNSUPPORTED_FORMAT'
      | 'EMPTY_DOCUMENT'
      | 'DOCX_LIMIT_EXCEEDED'
      | 'EXTRACTION_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'DocumentExtractionError'
  }
}
