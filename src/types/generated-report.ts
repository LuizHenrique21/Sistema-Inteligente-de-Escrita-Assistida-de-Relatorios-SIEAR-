import type {
  ActivityPattern,
  FormattingPattern,
  ReportTemplateRequirements,
  SectionPattern,
  SectionRelationship,
  SectionSemanticPattern,
  SectionWritingStyle,
  SemanticPattern,
  StructureField,
  StructurePattern,
  WritingPattern,
} from '../domain/templates'

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

export interface ExportReportDocxRequest {
  report: GeneratedReport
}

export type ExportReportDocxErrorCode =
  | 'INVALID_REQUEST'
  | 'TEMPLATE_NOT_FOUND'
  | 'CANCELED'
  | 'RENDER_ERROR'
  | 'WRITE_ERROR'
  | 'UNEXPECTED_ERROR'

export type ExportReportDocxResult =
  | { success: true; filePath: string }
  | {
      success: false
      error: { code: ExportReportDocxErrorCode; message: string }
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

export interface ReportGroundingPolicy {
  sourceOfFacts: 'structured-activity-only'
  templateIsNotFactSource: true
  requireEvidence: true
  prohibitUnsupportedFacts: true
}

export interface PlannedSectionFormatting {
  headingStyles: FormattingPattern['headingStyles']
  paragraphStyles: FormattingPattern['paragraphStyles']
}

export interface PlannedReportSection {
  sectionId: string
  sectionName: string
  order: number
  level: number
  parentSectionId: string | null
  required: boolean
  repeatable: boolean
  purpose: string | null
  structure: SectionPattern
  writingStyle: SectionWritingStyle | null
  semantics: SectionSemanticPattern | null
  formatting: PlannedSectionFormatting
  factNames: string[]
  activityIndexes: number[]
}

export interface ReportGenerationTemplateContext {
  structurePattern: StructurePattern
  fields: StructureField[]
  activityPatterns: ActivityPattern[]
  requirements: ReportTemplateRequirements
  writingPattern: WritingPattern
  semanticPattern: SemanticPattern
  crossSectionRelations: SectionRelationship[]
  formattingPattern: FormattingPattern
}

export interface ReportGenerationPlan {
  sections: PlannedReportSection[]
  missing: MissingRequiredInformation[]
  groundingPolicy: ReportGroundingPolicy
  templateContext: ReportGenerationTemplateContext
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
