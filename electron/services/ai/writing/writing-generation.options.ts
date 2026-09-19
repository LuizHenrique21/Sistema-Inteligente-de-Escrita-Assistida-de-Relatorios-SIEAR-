import type { OllamaGenerationMetrics } from '../../ollama/ollama.service'

export interface WritingGenerationOptions {
  signal?: AbortSignal
  numPredict?: number
  temperature?: number
  think?: boolean
  onMetrics?: (metrics: OllamaGenerationMetrics) => void
}
