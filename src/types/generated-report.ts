export interface GeneratedReportSection {
  id: string
  name: string
  order: number
  content: string
  elements?: GeneratedReportElement[]
}

export type GeneratedReportElement =
  | { type: 'paragraph'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; rows: string[][]; headerRows: number }
  | {
      type: 'figure'
      dataBase64: string
      contentType: 'image/png' | 'image/jpeg'
      fileName: string
      caption: string | null
    }
  | { type: 'page-break' }

export interface GeneratedReport {
  id: string
  templateId: string
  templateName: string
  sections: GeneratedReportSection[]
  createdAt: string
}

export interface GenerateReportRequest {
  text: string
  templateId: string
}

export interface StructuredFact {
  name: string
  label: string
  value: string
  evidence: string
}

export interface StructuredActivityItem {
  description: string
  procedures: string[]
  result: string | null
  problems: string[]
  evidence: string[]
}

export interface StructuredActivity {
  facts: StructuredFact[]
  activities: StructuredActivityItem[]
}

export interface MissingRequiredInformation {
  fieldId: string
  fieldName: string
  label: string
  question: string
}

export interface PlannedReportSection {
  sectionId: string
  sectionName: string
  order: number
  factNames: string[]
  activityIndexes: number[]
}

export interface ReportGenerationPlan {
  sections: PlannedReportSection[]
  missing: MissingRequiredInformation[]
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
      success: true
      requiresInput: true
      structuredActivity: StructuredActivity
      missing: MissingRequiredInformation[]
      questions: string[]
    }
  | {
      success: false
      error: { code: ReportGenerationErrorCode; message: string }
    }
