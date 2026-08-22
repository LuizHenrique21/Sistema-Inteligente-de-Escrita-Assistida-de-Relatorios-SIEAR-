import type { ReportTemplateV2Repository } from '../../repositories/templates/report-template-v2.repository'
import {
  REPORT_TEMPLATE_V2_VERSION,
  type ReportTemplateV2,
} from './report-template-v2.types'

export type ReportTemplateV2ServiceErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_VERSION'

export class ReportTemplateV2ServiceError extends Error {
  constructor(
    public readonly code: ReportTemplateV2ServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReportTemplateV2ServiceError'
  }
}

export type ReportTemplateV2Clock = () => string

function cloneTemplate(template: ReportTemplateV2): ReportTemplateV2 {
  return structuredClone(template)
}

function requireCurrentVersion(template: ReportTemplateV2): void {
  if (template.version !== REPORT_TEMPLATE_V2_VERSION) {
    throw new ReportTemplateV2ServiceError(
      'INVALID_VERSION',
      `O modelo deve estar na versão ${REPORT_TEMPLATE_V2_VERSION}.`,
    )
  }
}

export class ReportTemplateV2Service {
  constructor(
    private readonly repository: ReportTemplateV2Repository,
    private readonly now: ReportTemplateV2Clock = () =>
      new Date().toISOString(),
  ) {}

  async create(template: ReportTemplateV2): Promise<ReportTemplateV2> {
    requireCurrentVersion(template)
    const timestamp = this.now()
    const candidate = cloneTemplate(template)
    candidate.metadata.status = 'draft'
    candidate.metadata.createdAt = timestamp
    candidate.metadata.updatedAt = timestamp
    return cloneTemplate(await this.repository.create(candidate))
  }

  async getById(id: string): Promise<ReportTemplateV2 | null> {
    const template = await this.repository.getById(id)
    return template ? cloneTemplate(template) : null
  }

  async getAll(): Promise<ReportTemplateV2[]> {
    return (await this.repository.getAll()).map(cloneTemplate)
  }

  async update(template: ReportTemplateV2): Promise<ReportTemplateV2> {
    requireCurrentVersion(template)
    const existing = await this.repository.getById(template.metadata.id)
    if (!existing) {
      throw new ReportTemplateV2ServiceError(
        'NOT_FOUND',
        'Modelo V2 não encontrado.',
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

  async confirm(id: string): Promise<ReportTemplateV2> {
    const existing = await this.repository.getById(id)
    if (!existing) {
      throw new ReportTemplateV2ServiceError(
        'NOT_FOUND',
        'Modelo V2 não encontrado.',
      )
    }
    requireCurrentVersion(existing)
    if (existing.metadata.status !== 'draft') {
      throw new ReportTemplateV2ServiceError(
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
