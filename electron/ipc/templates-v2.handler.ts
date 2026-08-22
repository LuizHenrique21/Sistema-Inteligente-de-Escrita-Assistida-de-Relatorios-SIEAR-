import path from 'node:path'
import type { TemplateImportProgress } from '../../src/types/template-import'
import type { TemplatesV2Result } from '../../src/types/templates-v2'
import { DocumentExtractionError } from '../services/documents/document-errors'
import { SemanticAnalysisError } from '../services/ai/semantic-analysis.service'
import { WritingAnalysisError } from '../services/ai/writing-analysis.service'
import { OllamaServiceError } from '../services/ollama/ollama.service'
import { StructureAnalysisError } from '../services/documents/structure-analysis.service'
import { ReportTemplateV2RepositoryError } from '../repositories/templates/in-memory-report-template-v2.repository'
import {
  ReportTemplateV2ServiceError,
} from '../services/templates/report-template-v2.service'
import {
  REPORT_TEMPLATE_V2_VERSION,
  type ReportTemplateV2,
} from '../services/templates/report-template-v2.types'
import { isReportTemplateV2 } from '../services/templates/report-template-v2.validation'

interface TemplateV2CreationPort {
  createFromDocument(
    filePath: string,
    onProgress?: (progress: TemplateImportProgress) => void,
  ): Promise<ReportTemplateV2>
}

interface TemplateV2ServicePort {
  getAll(): Promise<ReportTemplateV2[]>
  getById(id: string): Promise<ReportTemplateV2 | null>
  update(template: ReportTemplateV2): Promise<ReportTemplateV2>
  confirm(id: string): Promise<ReportTemplateV2>
  delete(id: string): Promise<void>
}

function failure<T>(code: string, message: string): TemplatesV2Result<T> {
  return { success: false, error: { code, message } }
}

function safeError<T>(error: unknown): TemplatesV2Result<T> {
  if (error instanceof OllamaServiceError) {
    console.error('[SIEAR] Falha do Ollama em templates V2:', error)
    return failure(
      'ANALYSIS_ERROR',
      'Não foi possível concluir a análise do documento.',
    )
  }
  if (
    error instanceof ReportTemplateV2ServiceError ||
    error instanceof ReportTemplateV2RepositoryError ||
    error instanceof DocumentExtractionError ||
    error instanceof StructureAnalysisError ||
    error instanceof WritingAnalysisError ||
    error instanceof SemanticAnalysisError
  ) {
    return failure(error.code, error.message)
  }
  console.error('[SIEAR] Falha em templates V2:', error)
  return failure(
    'UNEXPECTED_ERROR',
    'Ocorreu um erro inesperado ao gerenciar o modelo V2.',
  )
}

async function run<T>(operation: () => Promise<T>): Promise<TemplatesV2Result<T>> {
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
  if (
    request.requestId !== undefined &&
    !validId(request.requestId)
  )
    return null
  return path.extname(request.filePath).toLocaleLowerCase() === '.docx'
    ? request.filePath
    : null
}

export function createTemplatesV2Handlers(
  creationService: TemplateV2CreationPort,
  templateService: TemplateV2ServicePort,
) {
  return {
    createFromDocument: (
      request: unknown,
      onProgress?: (progress: TemplateImportProgress) => void,
    ): Promise<TemplatesV2Result<ReportTemplateV2>> => {
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

    getAll: (): Promise<TemplatesV2Result<ReportTemplateV2[]>> =>
      run(() => templateService.getAll()),

    getById: (
      id: unknown,
    ): Promise<TemplatesV2Result<ReportTemplateV2 | null>> =>
      validId(id)
        ? run(() => templateService.getById(id))
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),

    update: (value: unknown): Promise<TemplatesV2Result<ReportTemplateV2>> => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'version' in value &&
        value.version !== REPORT_TEMPLATE_V2_VERSION
      ) {
        return Promise.resolve(
          failure(
            'INVALID_VERSION',
            `O modelo deve estar na versão ${REPORT_TEMPLATE_V2_VERSION}.`,
          ),
        )
      }
      return isReportTemplateV2(value)
        ? run(() => templateService.update(value))
        : Promise.resolve(
            failure('VALIDATION_ERROR', 'O modelo V2 recebido é inválido.'),
          )
    },

    confirm: (id: unknown): Promise<TemplatesV2Result<ReportTemplateV2>> =>
      validId(id)
        ? run(() => templateService.confirm(id))
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),

    delete: (id: unknown): Promise<TemplatesV2Result<null>> =>
      validId(id)
        ? run(async () => {
            await templateService.delete(id)
            return null
          })
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),
  }
}
