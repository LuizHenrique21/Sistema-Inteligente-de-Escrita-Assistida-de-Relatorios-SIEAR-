export const BASELINE_REPORT_VERSION = 1 as const

export type BaselineMetricStatus =
  | 'completed'
  | 'failed'
  | 'not-reached'
  | 'not-measured'

export interface BaselineStageMetric {
  operationId: string
  requestId: string | null
  timestamp: string
  stage: string
  name: string
  durationMs: number | null
  inputSizeBytes: number | null
  outputSizeBytes: number | null
  heapBeforeBytes: number | null
  heapAfterBytes: number | null
  heapDeltaBytes: number | null
  status: BaselineMetricStatus
  success: boolean | null
  errorCode: string | null
}

export interface BaselineOllamaCallMetric {
  operationId: string
  requestId: string | null
  timestamp: string
  stage: 'ollama'
  index: number
  model: string
  durationMs: number
  inputSizeBytes: number
  outputSizeBytes: number
  promptCharacters: number
  responseCharacters: number
  promptTokens: number | null
  generatedTokens: number | null
  promptEvaluationMs: number | null
  generationMs: number | null
  tokensPerSecond: number | null
}

export interface BaselineReport {
  version: typeof BASELINE_REPORT_VERSION
  benchmarkId: string
  operationId: string
  requestId: string | null
  createdAt: string
  status: 'completed' | 'failed'
  failure: { name: string; code: string | null } | null
  fixture: {
    id: string
    sizeBytes: number
    sha256: string
  }
  environment: {
    platform: string
    architecture: string
    nodeVersion: string
    cpuModel: string
    logicalCpuCount: number
    totalMemoryBytes: number
    freeMemoryBeforeBytes: number
    model: string
  }
  totalDurationMs: number
  stages: BaselineStageMetric[]
  ollama: {
    callCount: number
    totalPromptCharacters: number
    totalResponseCharacters: number
    totalPromptTokens: number | null
    totalGeneratedTokens: number | null
    calls: BaselineOllamaCallMetric[]
  }
  memory: {
    heapBeforeBytes: number
    heapAfterBytes: number
    heapPeakObservedBytes: number
    rssBeforeBytes: number
    rssAfterBytes: number
  }
  eventLoop: {
    meanDelayMs: number | null
    maxDelayMs: number
    p99DelayMs: number
  }
  serialization: {
    structuredCloneCalls: number
    templateJsonBytes: number | null
    estimatedCreateIpcBytes: number | null
    estimatedGetAllIpcBytes: number | null
  }
}
