import type { AiErrorCode } from '../../../src/types/siear-api'
import { getLogger } from '../../infrastructure/logging/logger.runtime'
import { serializeError } from '../../infrastructure/logging/log-sanitizer'

const OLLAMA_BASE_URL = 'http://localhost:11434'
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b'
const DEFAULT_OLLAMA_TIMEOUT_MS = 300_000
const logger = getLogger('OllamaService')

export interface OllamaServiceOptions {
  baseUrl?: string
  model?: string
  timeoutMs?: number
  onMetrics?: (metrics: OllamaGenerationMetrics) => void
}

export interface OllamaGenerationMetrics {
  model: string
  durationMs: number
  promptBytes: number
  responseBytes: number
  promptCharacters: number
  responseCharacters: number
  promptTokens: number | null
  generatedTokens: number | null
  promptEvaluationMs: number | null
  generationMs: number | null
  tokensPerSecond: number | null
}

function configuredTimeoutMs(): number {
  const configured = Number(process.env.SIEAR_OLLAMA_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_OLLAMA_TIMEOUT_MS
}

interface OllamaChatResponse {
  message: {
    content: string
  }
  prompt_eval_count?: number
  eval_count?: number
  prompt_eval_duration?: number
  eval_duration?: number
}

export class OllamaServiceError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OllamaServiceError'
  }
}

function isOllamaChatResponse(value: unknown): value is OllamaChatResponse {
  if (typeof value !== 'object' || value === null || !('message' in value)) {
    return false
  }

  const message = value.message
  return (
    typeof message === 'object' &&
    message !== null &&
    'content' in message &&
    typeof message.content === 'string'
  )
}

export class OllamaService {
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly onMetrics?: (metrics: OllamaGenerationMetrics) => void

  constructor(options: OllamaServiceOptions = {}) {
    this.baseUrl = options.baseUrl ?? OLLAMA_BASE_URL
    this.model = options.model ?? DEFAULT_OLLAMA_MODEL
    this.timeoutMs = options.timeoutMs ?? configuredTimeoutMs()
    this.onMetrics = options.onMetrics
  }

  get modelName(): string {
    return this.model
  }

  generateJson(
    prompt: string,
    schema?: Record<string, unknown>,
  ): Promise<string> {
    return this.generate(prompt, schema ?? 'json')
  }

  async generate(
    prompt: string,
    format?: 'json' | Record<string, unknown>,
  ): Promise<string> {
    let response: Response
    const startedAt = performance.now()
    logger.info('Ollama request started', {
      operation: 'generate',
      model: this.model,
      endpoint: '/api/chat',
      promptLength: prompt.length,
      structuredFormat: typeof format === 'object',
      timeoutMs: this.timeoutMs,
    })

    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          ...(format ? { format } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - startedAt)
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        logger.error('Ollama request failed', {
          durationMs,
          code: 'TIMEOUT',
          error: serializeError(error),
        })
        throw new OllamaServiceError(
          'TIMEOUT',
          'O Ollama demorou demais para responder. Tente novamente.',
        )
      }

      if (error instanceof TypeError) {
        logger.error('Ollama request failed', {
          durationMs,
          code: 'OLLAMA_UNAVAILABLE',
          error: serializeError(error),
        })
        throw new OllamaServiceError(
          'OLLAMA_UNAVAILABLE',
          'Ollama não está disponível. Verifique se o Ollama está instalado e em execução.',
        )
      }

      logger.error('Ollama request failed', {
        durationMs,
        code: 'UNEXPECTED_ERROR',
        error: serializeError(error),
      })
      throw new OllamaServiceError(
        'UNEXPECTED_ERROR',
        'Ocorreu um erro inesperado ao comunicar com o Ollama.',
      )
    }

    if (response.status === 404) {
      logger.error('Ollama request failed', {
        durationMs: Math.round(performance.now() - startedAt),
        code: 'MODEL_NOT_FOUND',
        status: response.status,
      })
      throw new OllamaServiceError(
        'MODEL_NOT_FOUND',
        `O modelo ${this.model} não está instalado no Ollama.`,
      )
    }

    if (!response.ok) {
      logger.error('Ollama request failed', {
        durationMs: Math.round(performance.now() - startedAt),
        code: 'HTTP_ERROR',
        status: response.status,
      })
      throw new OllamaServiceError(
        'HTTP_ERROR',
        `O Ollama respondeu com um erro HTTP (${response.status}).`,
      )
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      logger.error('Ollama request failed', {
        durationMs: Math.round(performance.now() - startedAt),
        code: 'INVALID_RESPONSE',
      })
      throw new OllamaServiceError(
        'INVALID_RESPONSE',
        'O Ollama retornou uma resposta JSON inválida.',
      )
    }

    if (!isOllamaChatResponse(data) || data.message.content.trim() === '') {
      logger.error('Ollama request failed', {
        durationMs: Math.round(performance.now() - startedAt),
        code: 'INVALID_RESPONSE',
      })
      throw new OllamaServiceError(
        'INVALID_RESPONSE',
        'O Ollama retornou uma resposta em formato inesperado.',
      )
    }

    const durationMs = Math.round(performance.now() - startedAt)
    const promptTokens = finiteNumber(data.prompt_eval_count)
    const generatedTokens = finiteNumber(data.eval_count)
    const promptEvaluationMs = nanosecondsToMilliseconds(
      data.prompt_eval_duration,
    )
    const generationMs = nanosecondsToMilliseconds(data.eval_duration)
    const tokensPerSecond =
      generatedTokens !== null && generationMs !== null && generationMs > 0
        ? generatedTokens / (generationMs / 1000)
        : null
    const metrics: OllamaGenerationMetrics = {
      model: this.model,
      durationMs,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      responseBytes: Buffer.byteLength(data.message.content, 'utf8'),
      promptCharacters: prompt.length,
      responseCharacters: data.message.content.length,
      promptTokens,
      generatedTokens,
      promptEvaluationMs,
      generationMs,
      tokensPerSecond,
    }
    try {
      this.onMetrics?.(metrics)
    } catch {
      logger.warn('Ollama metrics observer failed', {
        operation: 'generate',
        model: this.model,
      })
    }
    logger.info('Ollama request completed', {
      model: this.model,
      durationMs,
      responseLength: data.message.content.length,
      promptTokens,
      generatedTokens,
      tokensPerSecond,
    })
    return data.message.content
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nanosecondsToMilliseconds(value: unknown): number | null {
  const duration = finiteNumber(value)
  return duration === null ? null : duration / 1_000_000
}
