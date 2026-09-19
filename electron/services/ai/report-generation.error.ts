export class ReportGenerationServiceError extends Error {
  readonly code = 'INVALID_MODEL_RESPONSE' as const

  constructor(message: string) {
    super(message)
    this.name = 'ReportGenerationServiceError'
  }
}
