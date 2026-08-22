import type {
  GenerateReportRequest,
  GenerateReportResult,
} from './generated-report'
import type { TemplatesApi } from './report-template'
import type { DocumentsApi } from './template-import'
import type { TemplatesV2Api } from './templates-v2'

export interface AppInfo {
  name: string
  version: string
  environment: 'development' | 'production'
}

export interface AiGenerateRequest {
  prompt: string
}

export type AiErrorCode =
  | 'INVALID_PROMPT'
  | 'OLLAMA_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNEXPECTED_ERROR'

export interface AiGenerateSuccess {
  ok: true
  content: string
}

export interface AiGenerateFailure {
  ok: false
  error: {
    code: AiErrorCode
    message: string
  }
}

export type AiGenerateResult = AiGenerateSuccess | AiGenerateFailure

export interface ReportInformation {
  equipment: string | null
  activities: string[]
  result: string | null
  problems: string | null
  duration: string | null
  observations: string | null
}

export interface ExtractReportInformationRequest {
  text: string
}

export type ReportExtractionErrorCode =
  'INVALID_TEXT' | 'INVALID_MODEL_RESPONSE' | AiErrorCode

export interface ExtractReportInformationSuccess {
  success: true
  data: ReportInformation
}

export interface ExtractReportInformationFailure {
  success: false
  error: {
    code: ReportExtractionErrorCode
    message: string
  }
}

export type ExtractReportInformationResult =
  ExtractReportInformationSuccess | ExtractReportInformationFailure

export interface SiearApi {
  app: { getInfo: () => Promise<AppInfo> }
  ai: {
    generate: (request: AiGenerateRequest) => Promise<AiGenerateResult>
    extractReportInformation: (
      request: ExtractReportInformationRequest,
    ) => Promise<ExtractReportInformationResult>
    generateReport: (
      request: GenerateReportRequest,
    ) => Promise<GenerateReportResult>
  }
  templates: TemplatesApi
  templatesV2: TemplatesV2Api
  documents: DocumentsApi
}
