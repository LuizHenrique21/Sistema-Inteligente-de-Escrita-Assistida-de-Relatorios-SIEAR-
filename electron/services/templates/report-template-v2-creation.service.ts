import type { ReportTemplateV2 } from './report-template-v2.types'
import type { TemplateCreationProgressListener } from './template-creation.pipeline'

export interface ReportTemplateV2CreationPipeline {
  executeV2(
    filePath: string,
    onProgress?: TemplateCreationProgressListener,
  ): Promise<ReportTemplateV2>
}

export interface ReportTemplateV2Registrar {
  create(template: ReportTemplateV2): Promise<ReportTemplateV2>
}

export class ReportTemplateV2CreationService {
  constructor(
    private readonly pipeline: ReportTemplateV2CreationPipeline,
    private readonly templateService: ReportTemplateV2Registrar,
  ) {}

  async createFromDocument(
    filePath: string,
    onProgress?: TemplateCreationProgressListener,
  ): Promise<ReportTemplateV2> {
    const analyzedTemplate = await this.pipeline.executeV2(
      filePath,
      onProgress,
    )
    return this.templateService.create(analyzedTemplate)
  }
}
