import type {
  GenerateReportRequest,
  GenerateReportResult,
} from '../../src/types/generated-report'
import type { ReportTemplate } from '../../src/types/report-template'
import { ReportGenerationServiceError } from '../services/ai/report-generation.service'
import { UserInformationExtractionError } from '../services/ai/user-information-extractor'
import { OllamaServiceError } from '../services/ollama/ollama.service'

export interface ReportGenerator {
  generate(
    text: string,
    template: ReportTemplate,
  ): Promise<GenerateReportResult>
}

export interface TemplateFinder {
  getById(id: string): Promise<ReportTemplate | null>
}

function isValidRequest(value: unknown): value is GenerateReportRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'templateId' in value &&
    typeof value.templateId === 'string' &&
    value.templateId.trim() !== '' &&
    'text' in value &&
    typeof value.text === 'string' &&
    value.text.trim() !== ''
  )
}

export function createReportGenerationHandler(
  generator: ReportGenerator,
  templates: TemplateFinder,
) {
  return async (request: unknown): Promise<GenerateReportResult> => {
    if (!isValidRequest(request)) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Os dados para geração do relatório são inválidos.',
        },
      }
    }

    try {
      const template = await templates.getById(request.templateId.trim())
      if (!template) {
        return {
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'O modelo de relatório selecionado não foi encontrado.',
          },
        }
      }
      return generator.generate(request.text.trim(), template)
    } catch (error: unknown) {
      if (
        error instanceof ReportGenerationServiceError ||
        error instanceof UserInformationExtractionError ||
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
          message: 'Ocorreu um erro inesperado ao gerar o relatório.',
        },
      }
    }
  }
}
