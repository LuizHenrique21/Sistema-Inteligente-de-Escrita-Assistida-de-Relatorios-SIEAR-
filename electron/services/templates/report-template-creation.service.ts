import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import type { TemplateCreationProgressListener } from './template-creation.pipeline'

export interface ReportTemplateCreationPipeline {
  execute(
    filePath: string,
    onProgress?: TemplateCreationProgressListener,
  ): Promise<ReportTemplate>
}

export interface ReportTemplateRegistrar {
  create(template: ReportTemplate): Promise<ReportTemplate>
  getById?(id: string): Promise<ReportTemplate | null>
}

export class ReportTemplateCreationService {
  constructor(
    private readonly pipeline: ReportTemplateCreationPipeline,
    private readonly templateService: ReportTemplateRegistrar,
  ) {}

  async createFromDocument(
    filePath: string,
    onProgress?: TemplateCreationProgressListener,
  ): Promise<ReportTemplate> {
    const analyzedTemplate = await this.pipeline.execute(filePath, onProgress)
    const existing = await this.templateService.getById?.(
      analyzedTemplate.metadata.id,
    )
    if (existing) return existing
    return this.templateService.create(analyzedTemplate)
  }
}
