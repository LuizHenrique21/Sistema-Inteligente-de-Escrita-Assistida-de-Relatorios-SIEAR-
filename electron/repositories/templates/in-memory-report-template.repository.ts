import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'
import {
  ReportTemplateRepositoryError,
  type ReportTemplateRepository,
} from './report-template.repository'
import { isReportTemplate } from '../../services/templates/report-template.validation'

export {
  ReportTemplateRepositoryError,
  type ReportTemplateRepositoryErrorCode,
} from './report-template.repository'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateTemplate(template: ReportTemplate): void {
  if (!isRecord(template)) {
    throw new ReportTemplateRepositoryError(
      'VALIDATION_ERROR',
      'O modelo é obrigatório.',
    )
  }
  if (template.version !== REPORT_TEMPLATE_VERSION) {
    throw new ReportTemplateRepositoryError(
      'VALIDATION_ERROR',
      `O repositório aceita somente modelos na versão ${REPORT_TEMPLATE_VERSION}.`,
    )
  }
  if (!isReportTemplate(template)) {
    throw new ReportTemplateRepositoryError(
      'VALIDATION_ERROR',
      'A estrutura mínima do modelo é inválida.',
    )
  }
}

function cloneTemplate(template: ReportTemplate): ReportTemplate {
  return structuredClone(template)
}

export class InMemoryReportTemplateRepository implements ReportTemplateRepository {
  private readonly templates = new Map<string, ReportTemplate>()

  async create(template: ReportTemplate): Promise<ReportTemplate> {
    validateTemplate(template)
    const id = template.metadata.id
    if (this.templates.has(id)) {
      throw new ReportTemplateRepositoryError(
        'DUPLICATE_ID',
        `Já existe um modelo com o ID "${id}".`,
      )
    }
    const stored = cloneTemplate(template)
    this.templates.set(id, stored)
    return cloneTemplate(stored)
  }

  async getById(id: string): Promise<ReportTemplate | null> {
    const template = this.templates.get(id)
    return template ? cloneTemplate(template) : null
  }

  async getAll(): Promise<ReportTemplate[]> {
    return [...this.templates.values()].map(cloneTemplate)
  }

  async update(template: ReportTemplate): Promise<ReportTemplate> {
    validateTemplate(template)
    const id = template.metadata.id
    if (!this.templates.has(id)) {
      throw new ReportTemplateRepositoryError(
        'NOT_FOUND',
        `Modelo com o ID "${id}" não encontrado.`,
      )
    }
    const stored = cloneTemplate(template)
    this.templates.set(id, stored)
    return cloneTemplate(stored)
  }

  async delete(id: string): Promise<void> {
    this.templates.delete(id)
  }
}
