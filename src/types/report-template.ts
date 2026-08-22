export type ReportFormality = 'low' | 'medium' | 'high'

export interface ReportSection {
  id: string
  name: string
  description: string
  required: boolean
  order: number
}

export interface ReportTemplate {
  id: string
  name: string
  description: string
  objective: string
  tone: string
  style: string
  formality: ReportFormality
  sections: ReportSection[]
  writingRules: string[]
  recommendedVocabulary: string[]
  forbiddenExpressions: string[]
}

export type TemplateErrorCode =
  'VALIDATION_ERROR' | 'NOT_FOUND' | 'DUPLICATE_ID' | 'UNEXPECTED_ERROR'

export type TemplateResult<T> =
  | { success: true; data: T }
  | {
      success: false
      error: { code: TemplateErrorCode; message: string }
    }

export interface TemplatesApi {
  getAll(): Promise<TemplateResult<ReportTemplate[]>>
  getById(id: string): Promise<TemplateResult<ReportTemplate | null>>
  create(template: ReportTemplate): Promise<TemplateResult<ReportTemplate>>
  update(
    id: string,
    template: ReportTemplate,
  ): Promise<TemplateResult<ReportTemplate>>
  delete(id: string): Promise<TemplateResult<boolean>>
}
