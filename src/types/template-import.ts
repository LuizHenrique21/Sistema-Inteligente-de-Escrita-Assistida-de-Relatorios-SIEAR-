import type {
  ReportFieldType,
  ReportFormality,
  ReportTemplate,
} from './report-template'

export interface TemplateAnalysisSection {
  name: string
  description: string
  required: boolean
  order: number
}

export interface TemplateAnalysisField {
  name: string
  label: string
  type: ReportFieldType
  required: boolean
  description: string
}

export interface TemplateAnalysis {
  name: string
  description: string
  objective: string
  tone: string
  style: string
  formality: ReportFormality
  sections: TemplateAnalysisSection[]
  fields: TemplateAnalysisField[]
  writingRules: string[]
  recommendedVocabulary: string[]
  forbiddenExpressions: string[]
}

export type ImportTemplateResult =
  | { success: true; data: ReportTemplate; fileName: string }
  | {
      success: false
      canceled?: boolean
      error: { code: string; message: string }
    }

export interface DocumentsApi {
  selectAndAnalyzeTemplate(): Promise<ImportTemplateResult>
}
