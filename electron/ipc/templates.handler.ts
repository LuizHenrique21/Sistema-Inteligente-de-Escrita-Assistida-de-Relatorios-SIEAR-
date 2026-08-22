import type {
  ReportTemplate,
  TemplateResult,
} from '../../src/types/report-template'
import {
  isReportTemplate,
  ReportTemplateService,
  ReportTemplateServiceError,
} from '../services/templates/report-template.service'

function failure<T>(
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'DUPLICATE_ID' | 'UNEXPECTED_ERROR',
  message: string,
): TemplateResult<T> {
  return { success: false, error: { code, message } }
}

async function run<T>(operation: () => Promise<T>): Promise<TemplateResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error: unknown) {
    if (error instanceof ReportTemplateServiceError) {
      return failure(error.code, error.message)
    }
    return failure(
      'UNEXPECTED_ERROR',
      'Ocorreu um erro inesperado ao gerenciar os modelos.',
    )
  }
}

export function createTemplatesHandlers(service: ReportTemplateService) {
  return {
    getAll: (): Promise<TemplateResult<ReportTemplate[]>> =>
      run(() => service.getAll()),

    getById: (id: unknown): Promise<TemplateResult<ReportTemplate | null>> =>
      typeof id === 'string'
        ? run(() => service.getById(id))
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),

    create: (template: unknown): Promise<TemplateResult<ReportTemplate>> =>
      isReportTemplate(template)
        ? run(() => service.create(template))
        : Promise.resolve(
            failure('VALIDATION_ERROR', 'O modelo recebido é inválido.'),
          ),

    update: (
      id: unknown,
      template: unknown,
    ): Promise<TemplateResult<ReportTemplate>> =>
      typeof id === 'string' && isReportTemplate(template)
        ? run(() => service.update(id, template))
        : Promise.resolve(
            failure('VALIDATION_ERROR', 'Os dados do modelo são inválidos.'),
          ),

    delete: (id: unknown): Promise<TemplateResult<boolean>> =>
      typeof id === 'string'
        ? run(() => service.delete(id))
        : Promise.resolve(failure('VALIDATION_ERROR', 'ID inválido.')),
  }
}
