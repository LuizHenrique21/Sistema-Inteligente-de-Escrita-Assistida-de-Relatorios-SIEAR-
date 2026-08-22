import type { ReportInformation } from './siear-api'

export interface GeneratedReportSection {
  id: string
  name: string
  order: number
  content: string
}

export interface GeneratedReport {
  id: string
  templateId: string
  templateName: string
  sections: GeneratedReportSection[]
  createdAt: string
}

export interface GenerateReportRequest {
  information: ReportInformation
  templateId: string
}

export type ReportGenerationErrorCode =
  | 'INVALID_REQUEST'
  | 'TEMPLATE_NOT_FOUND'
  | 'INVALID_MODEL_RESPONSE'
  | 'OLLAMA_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_PROMPT'
  | 'UNEXPECTED_ERROR'

export type GenerateReportResult =
  | { success: true; data: GeneratedReport }
  | {
      success: false
      error: { code: ReportGenerationErrorCode; message: string }
    }
