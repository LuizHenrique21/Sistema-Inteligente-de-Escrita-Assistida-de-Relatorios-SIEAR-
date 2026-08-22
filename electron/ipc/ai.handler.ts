import type {
  AiGenerateRequest,
  AiGenerateResult,
} from '../../src/types/siear-api'
import { OllamaServiceError } from '../services/ollama/ollama.service'

export interface AiGenerationService {
  generate(prompt: string): Promise<string>
}

function isValidRequest(value: unknown): value is AiGenerateRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'prompt' in value &&
    typeof value.prompt === 'string' &&
    value.prompt.trim() !== ''
  )
}

export function createAiGenerateHandler(service: AiGenerationService) {
  return async (request: unknown): Promise<AiGenerateResult> => {
    if (!isValidRequest(request)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PROMPT',
          message: 'Digite um prompt antes de enviar para a IA.',
        },
      }
    }

    try {
      const content = await service.generate(request.prompt.trim())
      return { ok: true, content }
    } catch (error: unknown) {
      if (error instanceof OllamaServiceError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        }
      }

      return {
        ok: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Ocorreu um erro inesperado ao processar a solicitação.',
        },
      }
    }
  }
}
