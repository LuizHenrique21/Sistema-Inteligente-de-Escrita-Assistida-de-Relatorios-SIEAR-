import path from 'node:path'
import type { TemplateImportProgress } from '../../src/types/template-import'
import type { TemplatesResult } from '../../src/types/templates'
import { DocumentExtractionError } from '../services/documents/document-errors'
import { SemanticAnalysisError } from '../services/ai/semantic-analysis.service'
import { WritingAnalysisError } from '../services/ai/writing-analysis.service'
import { OllamaServiceError } from '../services/ollama/ollama.service'
import { StructureAnalysisError } from '../services/documents/structure-analysis.service'
import { ReportTemplateRepositoryError } from '../repositories/templates/report-template.repository'
import { ReportTemplateServiceError } from '../services/templates/report-template.service'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../src/domain/templates/report-template'
import { isReportTemplate } from '../services/templates/report-template.validation'

interface TemplateCreationPort {
  createFromDocument(
    filePath: string,
    onProgress?: (progress: TemplateImportProgress) => void,
  ): Promise<ReportTemplate>
}

interface TemplateServicePort {
  getAll(): Promise<ReportTemplate[]>
  getById(id: string): Promise<ReportTemplate | null>
  update(template: ReportTemplate): Promise<ReportTemplate>
  confirm(id: string): Promise<ReportTemplate>
  delete(id: string): Promise<void>
}

function failure<T>(code: string, message: string): TemplatesResult<T> {
  return { success: false, error: { code, message } }
}

function safeError<T>(error: unknown): TemplatesResult<T> {
  if (error instanceof OllamaServiceError) {
    console.error('[SIEAR] Falha do Ollama em templates:', error)
    return failure(
      'ANALYSIS_ERROR',
      'Não foi possível concluir a análise do documento.',
    )
  }
  if (
    error instanceof ReportTemplateServiceError ||
    error instanceof ReportTemplateRepositoryError ||
    error instanceof DocumentExtractionError ||
    error instanceof StructureAnalysisError ||
    error instanceof WritingAnalysisError ||
    error instanceof SemanticAnalysisError
  ) {
    return failure(error.code, error.message)
  }
  console.error('[SIEAR] Falha em templates:', error)
  return failure(
    'UNEXPECTED_ERROR',
    'Ocorreu um erro inesperado ao gerenciar o modelo.',
  )
}

async function run<T>(
  operation: () => Promise<T>,
): Promise<TemplatesResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error: unknown) {
    return safeError(error)
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function filePathFromRequest(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null
  const request = value as Record<string, unknown>
  if (!validId(request.filePath)) return null
  if (request.requestId !== undefined && !validId(request.requestId))
    return null
  return path.extname(request.filePath).toLocaleLowerCase() === '.docx'
    ? request.filePath
    : null
}

export function createTemplatesHandlers(
  creationService: TemplateCreationPort,
  templateService: TemplateServicePort,
) {
  return {
    createFromDocument: (
      request: unknown,
      onProgress?: (progress: TemplateImportProgress) => void,
    ): Promise<TemplatesResult<ReportTemplate>> => {
      const filePath = filePathFromRequest(request)
      return filePath
        ? run(() => creationService.createFromDocument(filePath, onProgress))
        : Promise.resolve(
            failure(
              'VALIDATION_ERROR',
              'Informe exatamente um caminho válido para um arquivo DOCX.',
            ),
          )
    },

    getAll: (): Promise<TemplatesResult<ReportTemplate[]>> =>
      run(() => templateService.getAll()),

    getById: (id: unknown): Promise<TemplatesResult<ReportTemplate | null>> =>
      validId(id)
        ? run(() => templateService.getById(id))
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),

    update: (value: unknown): Promise<TemplatesResult<ReportTemplate>> => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'version' in value &&
        value.version !== REPORT_TEMPLATE_VERSION
      ) {
        return Promise.resolve(
          failure(
            'INVALID_VERSION',
            `O modelo deve estar na versão ${REPORT_TEMPLATE_VERSION}.`,
          ),
        )
      }
      return isReportTemplate(value)
        ? run(() => templateService.update(value))
        : Promise.resolve(
            failure('VALIDATION_ERROR', 'O modelo recebido é inválido.'),
          )
    },

    confirm: (id: unknown): Promise<TemplatesResult<ReportTemplate>> =>
      validId(id)
        ? run(() => templateService.confirm(id))
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),

    delete: (id: unknown): Promise<TemplatesResult<null>> =>
      validId(id)
        ? run(async () => {
            await templateService.delete(id)
            return null
          })
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),
  }
}
