import type { ReportTemplateRepository } from '../../repositories/templates/report-template.repository'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'

export type ReportTemplateServiceErrorCode =
  'NOT_FOUND' | 'INVALID_STATE' | 'INVALID_VERSION'

export class ReportTemplateServiceError extends Error {
  constructor(
    public readonly code: ReportTemplateServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReportTemplateServiceError'
  }
}

export type ReportTemplateClock = () => string

function cloneTemplate(template: ReportTemplate): ReportTemplate {
  return structuredClone(template)
}

function requireCurrentVersion(template: ReportTemplate): void {
  if (template.version !== REPORT_TEMPLATE_VERSION) {
    throw new ReportTemplateServiceError(
      'INVALID_VERSION',
      `O modelo deve estar na versão ${REPORT_TEMPLATE_VERSION}.`,
    )
  }
}

export class ReportTemplateService {
  constructor(
    private readonly repository: ReportTemplateRepository,
    private readonly now: ReportTemplateClock = () => new Date().toISOString(),
  ) {}

  async create(template: ReportTemplate): Promise<ReportTemplate> {
    requireCurrentVersion(template)
    const timestamp = this.now()
    const candidate = cloneTemplate(template)
    candidate.metadata.status = 'draft'
    candidate.metadata.createdAt = timestamp
    candidate.metadata.updatedAt = timestamp
    return cloneTemplate(await this.repository.create(candidate))
  }

  async getById(id: string): Promise<ReportTemplate | null> {
    const template = await this.repository.getById(id)
    return template ? cloneTemplate(template) : null
  }

  async getAll(): Promise<ReportTemplate[]> {
    return (await this.repository.getAll()).map(cloneTemplate)
  }

  async update(template: ReportTemplate): Promise<ReportTemplate> {
    requireCurrentVersion(template)
    const existing = await this.repository.getById(template.metadata.id)
    if (!existing) {
      throw new ReportTemplateServiceError(
        'NOT_FOUND',
        'Modelo não encontrado.',
      )
    }
    requireCurrentVersion(existing)
    const candidate = cloneTemplate(template)
    candidate.metadata.status = existing.metadata.status
    candidate.metadata.createdAt = existing.metadata.createdAt
    candidate.metadata.updatedAt = this.now()
    return cloneTemplate(await this.repository.update(candidate))
  }

  delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }

  async confirm(id: string): Promise<ReportTemplate> {
    const existing = await this.repository.getById(id)
    if (!existing) {
      throw new ReportTemplateServiceError(
        'NOT_FOUND',
        'Modelo não encontrado.',
      )
    }
    requireCurrentVersion(existing)
    if (existing.metadata.status !== 'draft') {
      throw new ReportTemplateServiceError(
        'INVALID_STATE',
        'Somente um modelo em revisão pode ser confirmado.',
      )
    }
    const confirmed = cloneTemplate(existing)
    confirmed.metadata.status = 'confirmed'
    confirmed.metadata.updatedAt = this.now()
    return cloneTemplate(await this.repository.update(confirmed))
  }
}
