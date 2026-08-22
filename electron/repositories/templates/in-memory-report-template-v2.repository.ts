import {
  REPORT_TEMPLATE_V2_VERSION,
  type ReportTemplateV2,
} from '../../services/templates/report-template-v2.types'
import type { ReportTemplateV2Repository } from './report-template-v2.repository'
import { isReportTemplateV2 } from '../../services/templates/report-template-v2.validation'

export type ReportTemplateV2RepositoryErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_ID'
  | 'NOT_FOUND'

export class ReportTemplateV2RepositoryError extends Error {
  constructor(
    public readonly code: ReportTemplateV2RepositoryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReportTemplateV2RepositoryError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateTemplate(template: ReportTemplateV2): void {
  if (!isRecord(template)) {
    throw new ReportTemplateV2RepositoryError(
      'VALIDATION_ERROR',
      'O modelo V2 é obrigatório.',
    )
  }
  if (template.version !== REPORT_TEMPLATE_V2_VERSION) {
    throw new ReportTemplateV2RepositoryError(
      'VALIDATION_ERROR',
      `O repositório aceita somente modelos na versão ${REPORT_TEMPLATE_V2_VERSION}.`,
    )
  }
  if (!isReportTemplateV2(template)) {
    throw new ReportTemplateV2RepositoryError(
      'VALIDATION_ERROR',
      'A estrutura mínima do modelo V2 é inválida.',
    )
  }
}

function cloneTemplate(template: ReportTemplateV2): ReportTemplateV2 {
  return structuredClone(template)
}

export class InMemoryReportTemplateV2Repository implements ReportTemplateV2Repository {
  private readonly templates = new Map<string, ReportTemplateV2>()

  async create(template: ReportTemplateV2): Promise<ReportTemplateV2> {
    validateTemplate(template)
    const id = template.metadata.id
    if (this.templates.has(id)) {
      throw new ReportTemplateV2RepositoryError(
        'DUPLICATE_ID',
        `Já existe um modelo V2 com o ID "${id}".`,
      )
    }
    const stored = cloneTemplate(template)
    this.templates.set(id, stored)
    return cloneTemplate(stored)
  }

  async getById(id: string): Promise<ReportTemplateV2 | null> {
    const template = this.templates.get(id)
    return template ? cloneTemplate(template) : null
  }

  async getAll(): Promise<ReportTemplateV2[]> {
    return [...this.templates.values()].map(cloneTemplate)
  }

  async update(template: ReportTemplateV2): Promise<ReportTemplateV2> {
    validateTemplate(template)
    const id = template.metadata.id
    if (!this.templates.has(id)) {
      throw new ReportTemplateV2RepositoryError(
        'NOT_FOUND',
        `Modelo V2 com o ID "${id}" não encontrado.`,
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
