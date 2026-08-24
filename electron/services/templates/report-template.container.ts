import { InMemoryReportTemplateRepository } from '../../repositories/templates/in-memory-report-template.repository'
import type { ReportTemplateRepository } from '../../repositories/templates/report-template.repository'
import { SqliteReportTemplateRepository } from '../../repositories/templates/sqlite-report-template.repository'
import {
  ReportTemplateCreationService,
  type ReportTemplateCreationPipeline,
} from './report-template-creation.service'
import { ReportTemplateService } from './report-template.service'

export interface ReportTemplateContainer {
  repository: ReportTemplateRepository
  service: ReportTemplateService
}

export function createReportTemplateContainer(): ReportTemplateContainer {
  const repository = new InMemoryReportTemplateRepository()
  return {
    repository,
    service: new ReportTemplateService(repository),
  }
}

export interface ReportTemplateCreationContainer extends ReportTemplateContainer {
  creationService: ReportTemplateCreationService
}

export function createReportTemplateCreationContainer(
  pipeline: ReportTemplateCreationPipeline,
): ReportTemplateCreationContainer {
  const container = createReportTemplateContainer()
  return {
    ...container,
    creationService: new ReportTemplateCreationService(
      pipeline,
      container.service,
    ),
  }
}

export interface ProductionReportTemplateCreationContainer extends ReportTemplateCreationContainer {
  repository: SqliteReportTemplateRepository
}

/** Composição usada pelo Main Process. Testes unitários continuam em memória. */
export function createProductionReportTemplateCreationContainer(
  pipeline: ReportTemplateCreationPipeline,
  databasePath: string,
): ProductionReportTemplateCreationContainer {
  const repository = new SqliteReportTemplateRepository(databasePath)
  const service = new ReportTemplateService(repository)
  return {
    repository,
    service,
    creationService: new ReportTemplateCreationService(pipeline, service),
  }
}
