import { InMemoryReportTemplateRepository } from '../../repositories/templates/in-memory-report-template.repository'
import { TECHNICAL_REPORT_TEMPLATE } from './default-report-templates'
import { ReportTemplateService } from './report-template.service'

export const reportTemplateRepository = new InMemoryReportTemplateRepository([
  TECHNICAL_REPORT_TEMPLATE,
])

export const reportTemplateService = new ReportTemplateService(
  reportTemplateRepository,
)
