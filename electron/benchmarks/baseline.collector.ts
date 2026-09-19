import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { OllamaGenerationMetrics } from '../services/ollama/ollama.service'
import type {
  BaselineMetricStatus,
  BaselineOllamaCallMetric,
  BaselineStageMetric,
} from './baseline.types'

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return null
  return typeof error.code === 'string' ? error.code : null
}

export class BaselineCollector {
  readonly stages: BaselineStageMetric[] = []
  readonly ollamaCalls: BaselineOllamaCallMetric[] = []
  readonly operationId: string
  readonly requestId: string | null
  private heapPeak = process.memoryUsage().heapUsed

  constructor(options: { operationId?: string; requestId?: string } = {}) {
    this.operationId = options.operationId ?? randomUUID()
    this.requestId = options.requestId ?? null
  }

  get heapPeakObservedBytes(): number {
    return this.heapPeak
  }

  async measure<T>(
    name: string,
    operation: () => T | Promise<T>,
    options: {
      inputSizeBytes?: number | null
      outputSizeBytes?: (result: T) => number | null
    } = {},
  ): Promise<T> {
    const before = process.memoryUsage().heapUsed
    this.heapPeak = Math.max(this.heapPeak, before)
    const timestamp = new Date().toISOString()
    const startedAt = performance.now()
    try {
      const result = await operation()
      const durationMs = performance.now() - startedAt
      this.recordStage({
        name,
        timestamp,
        durationMs,
        heapBeforeBytes: before,
        status: 'completed',
        errorCode: null,
        inputSizeBytes: options.inputSizeBytes ?? null,
        outputSizeBytes: options.outputSizeBytes?.(result) ?? null,
      })
      return result
    } catch (error: unknown) {
      this.recordStage({
        name,
        timestamp,
        durationMs: performance.now() - startedAt,
        heapBeforeBytes: before,
        status: 'failed',
        errorCode: errorCode(error),
        inputSizeBytes: options.inputSizeBytes ?? null,
        outputSizeBytes: null,
      })
      throw error
    }
  }

  recordUnavailable(
    name: string,
    status: Extract<BaselineMetricStatus, 'not-reached' | 'not-measured'>,
  ): void {
    if (this.stages.some((metric) => metric.name === name)) return
    this.stages.push({
      operationId: this.operationId,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      stage: name,
      name,
      durationMs: null,
      inputSizeBytes: null,
      outputSizeBytes: null,
      heapBeforeBytes: null,
      heapAfterBytes: null,
      heapDeltaBytes: null,
      status,
      success: null,
      errorCode: null,
    })
  }

  recordOllamaCall(metric: OllamaGenerationMetrics): void {
    this.ollamaCalls.push({
      operationId: this.operationId,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      stage: 'ollama',
      index: this.ollamaCalls.length + 1,
      inputSizeBytes: metric.promptBytes,
      outputSizeBytes: metric.responseBytes,
      model: metric.model,
      durationMs: metric.durationMs,
      promptCharacters: metric.promptCharacters,
      responseCharacters: metric.responseCharacters,
      promptTokens: metric.promptTokens,
      generatedTokens: metric.generatedTokens,
      promptEvaluationMs: metric.promptEvaluationMs,
      generationMs: metric.generationMs,
      tokensPerSecond: metric.tokensPerSecond,
    })
  }

  private recordStage(metric: {
    name: string
    timestamp: string
    durationMs: number
    inputSizeBytes: number | null
    outputSizeBytes: number | null
    heapBeforeBytes: number
    status: Extract<BaselineMetricStatus, 'completed' | 'failed'>
    errorCode: string | null
  }): void {
    const heapAfterBytes = process.memoryUsage().heapUsed
    this.heapPeak = Math.max(this.heapPeak, heapAfterBytes)
    this.stages.push({
      operationId: this.operationId,
      requestId: this.requestId,
      timestamp: metric.timestamp,
      stage: metric.name,
      name: metric.name,
      durationMs: Math.round(metric.durationMs * 100) / 100,
      inputSizeBytes: metric.inputSizeBytes,
      outputSizeBytes: metric.outputSizeBytes,
      heapBeforeBytes: metric.heapBeforeBytes,
      heapAfterBytes,
      heapDeltaBytes: heapAfterBytes - metric.heapBeforeBytes,
      status: metric.status,
      success: metric.status === 'completed',
      errorCode: metric.errorCode,
    })
  }
}
