import type { ReportTemplate } from '../domain/templates/report-template'
import type { TemplateImportProgress } from './template-import'

export interface TemplatesError {
  code: string
  message: string
}

export type TemplatesResult<T> =
  { success: true; data: T } | { success: false; error: TemplatesError }

export interface TemplatesApi {
  createFromDocument(): Promise<TemplatesResult<ReportTemplate>>
  onCreationProgress(
    listener: (progress: TemplateImportProgress) => void,
  ): () => void
  getAll(): Promise<TemplatesResult<ReportTemplate[]>>
  getById(id: string): Promise<TemplatesResult<ReportTemplate | null>>
  update(template: ReportTemplate): Promise<TemplatesResult<ReportTemplate>>
  confirm(id: string): Promise<TemplatesResult<ReportTemplate>>
  delete(id: string): Promise<TemplatesResult<null>>
}
