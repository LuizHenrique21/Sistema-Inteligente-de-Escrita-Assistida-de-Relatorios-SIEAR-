import type { AiErrorCode } from '../../../src/types/siear-api'

const OLLAMA_BASE_URL = 'http://localhost:11434'
const OLLAMA_MODEL = 'qwen3:8b'
const OLLAMA_TIMEOUT_MS = 120_000

interface OllamaChatResponse {
  message: {
    content: string
  }
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

    try {
      response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          ...(format ? { format } : {}),
        }),
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      })
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new OllamaServiceError(
          'TIMEOUT',
          'O Ollama demorou demais para responder. Tente novamente.',
        )
      }

      if (error instanceof TypeError) {
        throw new OllamaServiceError(
          'OLLAMA_UNAVAILABLE',
          'Ollama não está disponível. Verifique se o Ollama está instalado e em execução.',
        )
      }

      throw new OllamaServiceError(
        'UNEXPECTED_ERROR',
        'Ocorreu um erro inesperado ao comunicar com o Ollama.',
      )
    }

    if (response.status === 404) {
      throw new OllamaServiceError(
        'MODEL_NOT_FOUND',
        `O modelo ${OLLAMA_MODEL} não está instalado no Ollama.`,
      )
    }

    if (!response.ok) {
      throw new OllamaServiceError(
        'HTTP_ERROR',
        `O Ollama respondeu com um erro HTTP (${response.status}).`,
      )
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new OllamaServiceError(
        'INVALID_RESPONSE',
        'O Ollama retornou uma resposta JSON inválida.',
      )
    }

    if (!isOllamaChatResponse(data) || data.message.content.trim() === '') {
      throw new OllamaServiceError(
        'INVALID_RESPONSE',
        'O Ollama retornou uma resposta em formato inesperado.',
      )
    }

    return data.message.content
  }
}
