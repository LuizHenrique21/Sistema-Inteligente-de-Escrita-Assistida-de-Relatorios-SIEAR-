import type { ReportTemplateRepository } from '../../repositories/templates/report-template.repository'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('ReportTemplateService')

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
    logger.info('Template create started', { templateId: template.metadata.id })
    requireCurrentVersion(template)
    const timestamp = this.now()
    const candidate = cloneTemplate(template)
    candidate.metadata.status = 'draft'
    candidate.metadata.createdAt = timestamp
    candidate.metadata.updatedAt = timestamp
    const created = cloneTemplate(await this.repository.create(candidate))
    logger.info('Template created', { templateId: created.metadata.id })
    return created
  }

  async getById(id: string): Promise<ReportTemplate | null> {
    logger.debug('Template getById', { templateId: id })
    const template = await this.repository.getById(id)
    return template ? cloneTemplate(template) : null
  }

  async getAll(): Promise<ReportTemplate[]> {
    logger.debug('Template getAll')
    return (await this.repository.getAll()).map(cloneTemplate)
  }

  async update(template: ReportTemplate): Promise<ReportTemplate> {
    logger.info('Template update started', { templateId: template.metadata.id })
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
    const updated = cloneTemplate(await this.repository.update(candidate))
    logger.info('Template updated', { templateId: updated.metadata.id })
    return updated
  }

  delete(id: string): Promise<void> {
    logger.info('Template delete started', { templateId: id })
    return this.repository.delete(id)
  }

  async confirm(id: string): Promise<ReportTemplate> {
    logger.info('Template confirmation started', { templateId: id })
    const existing = await this.repository.getById(id)
    if (!existing) {
      throw new ReportTemplateServiceError(
        'NOT_FOUND',
        'Modelo não encontrado.',
      )
    }
    requireCurrentVersion(existing)
    if (existing.metadata.status !== 'draft') {
      logger.warn('Template confirmation rejected', {
        templateId: id,
        status: existing.metadata.status,
      })
      throw new ReportTemplateServiceError(
        'INVALID_STATE',
        'Somente um modelo em revisão pode ser confirmado.',
      )
    }
    const confirmed = cloneTemplate(existing)
    confirmed.metadata.status = 'confirmed'
    confirmed.metadata.updatedAt = this.now()
    const result = cloneTemplate(await this.repository.update(confirmed))
    logger.info('Template confirmed', { templateId: id })
    return result
  }
}
