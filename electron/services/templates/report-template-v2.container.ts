import { InMemoryReportTemplateV2Repository } from '../../repositories/templates/in-memory-report-template-v2.repository'
import type { ReportTemplateV2Repository } from '../../repositories/templates/report-template-v2.repository'
import {
  ReportTemplateV2CreationService,
  type ReportTemplateV2CreationPipeline,
} from './report-template-v2-creation.service'
import { ReportTemplateV2Service } from './report-template-v2.service'

export interface ReportTemplateV2Container {
  repository: ReportTemplateV2Repository
  service: ReportTemplateV2Service
}

export function createReportTemplateV2Container(): ReportTemplateV2Container {
  const repository = new InMemoryReportTemplateV2Repository()
  return {
    repository,
    service: new ReportTemplateV2Service(repository),
  }
}

export interface ReportTemplateV2CreationContainer
  extends ReportTemplateV2Container {
  creationService: ReportTemplateV2CreationService
}

export function createReportTemplateV2CreationContainer(
  pipeline: ReportTemplateV2CreationPipeline,
): ReportTemplateV2CreationContainer {
  const container = createReportTemplateV2Container()
  return {
    ...container,
    creationService: new ReportTemplateV2CreationService(
      pipeline,
      container.service,
    ),
  }
}
