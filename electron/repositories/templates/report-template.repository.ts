import type { ReportTemplate } from '../../../src/domain/templates/report-template'

export type ReportTemplateRepositoryErrorCode =
  'VALIDATION_ERROR' | 'DUPLICATE_ID' | 'NOT_FOUND'

export class ReportTemplateRepositoryError extends Error {
  constructor(
    public readonly code: ReportTemplateRepositoryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReportTemplateRepositoryError'
  }
}

export interface ReportTemplateRepository {
  create(template: ReportTemplate): Promise<ReportTemplate>
  getById(id: string): Promise<ReportTemplate | null>
  getAll(): Promise<ReportTemplate[]>
  update(template: ReportTemplate): Promise<ReportTemplate>
  delete(id: string): Promise<void>
}
