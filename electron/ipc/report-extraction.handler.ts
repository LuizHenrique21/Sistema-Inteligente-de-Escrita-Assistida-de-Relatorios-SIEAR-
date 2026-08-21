import type {
  ExtractReportInformationRequest,
  ExtractReportInformationResult,
  ReportInformation,
} from '../../src/types/siear-api'
import { ReportExtractionServiceError } from '../services/ai/report-extraction.service'
import { OllamaServiceError } from '../services/ollama/ollama.service'

export interface ReportInformationExtractor {
  extract(text: string): Promise<ReportInformation>
}

function isValidRequest(
  value: unknown,
): value is ExtractReportInformationRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof value.text === 'string' &&
    value.text.trim() !== ''
  )
}

export function createReportExtractionHandler(
  service: ReportInformationExtractor,
) {
  return async (request: unknown): Promise<ExtractReportInformationResult> => {
    if (!isValidRequest(request)) {
      return {
        success: false,
        error: {
          code: 'INVALID_TEXT',
          message: 'Digite uma descrição antes de extrair as informações.',
        },
      }
    }

    try {
      const data = await service.extract(request.text.trim())
      return { success: true, data }
    } catch (error: unknown) {
      if (
        error instanceof ReportExtractionServiceError ||
        error instanceof OllamaServiceError
      ) {
        return {
          success: false,
          error: { code: error.code, message: error.message },
        }
      }

      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Ocorreu um erro inesperado durante a extração.',
        },
      }
    }
  }
}
