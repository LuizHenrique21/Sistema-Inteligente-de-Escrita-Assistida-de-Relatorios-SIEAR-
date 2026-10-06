import type { FormattingPattern } from '../../../src/domain/templates/formatting-pattern'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import type { GeneratedReport } from '../../../src/types/generated-report'
import type { DocxProcessingLimits } from '../documents/docx-processing-limits'
import type { DocumentRepresentation } from '../documents/types'

export type CpuWorkerTaskType =
  | 'docx-extraction'
  | 'formatting-analysis'
  | 'docx-render'
  | 'diagnostic-delay'

export interface CpuWorkerMetrics {
  requestId: string
  type: CpuWorkerTaskType
  queuedAt: number
  startedAt: number
  finishedAt: number
  durationMs: number
  workerMemoryRssBytes: number
  workerUrlResolutionMs?: number
  workerStartupMs?: number
  hostRoundTripMs?: number
}

export interface DocxExtractionWorkerInput {
  filePath: string
  fileName: string
  fileSize: number
  limits: DocxProcessingLimits
}

export interface FormattingAnalysisWorkerInput {
  document: DocumentRepresentation
}

export interface DocxRenderWorkerInput {
  report: GeneratedReport
  template: ReportTemplate
}

export interface DiagnosticDelayWorkerInput {
  delayMs: number
  payloadBytes?: number
  fail?: boolean
}

export type CpuWorkerInputByType = {
  'docx-extraction': DocxExtractionWorkerInput
  'formatting-analysis': FormattingAnalysisWorkerInput
  'docx-render': DocxRenderWorkerInput
  'diagnostic-delay': DiagnosticDelayWorkerInput
}

export type CpuWorkerOutputByType = {
  'docx-extraction': DocumentRepresentation
  'formatting-analysis': FormattingPattern
  'docx-render': ArrayBuffer
  'diagnostic-delay': { payloadBytes: number; checksum: number }
}

export interface CpuWorkerRequest<T extends CpuWorkerTaskType = CpuWorkerTaskType> {
  requestId: string
  type: T
  input: CpuWorkerInputByType[T]
  queuedAt: number
}

export interface CpuWorkerSuccess<T extends CpuWorkerTaskType = CpuWorkerTaskType> {
  requestId: string
  ok: true
  output: CpuWorkerOutputByType[T]
  metrics: CpuWorkerMetrics
}

export interface CpuWorkerFailure {
  requestId: string
  ok: false
  error: {
    name: string
    message: string
    code?: string
  }
  metrics?: CpuWorkerMetrics
}

export type CpuWorkerResponse<T extends CpuWorkerTaskType = CpuWorkerTaskType> =
  | CpuWorkerSuccess<T>
  | CpuWorkerFailure

export interface CpuWorkerRunOptions {
  requestId?: string
  signal?: AbortSignal
  timeoutMs?: number
  workerUrlOverride?: URL
}
