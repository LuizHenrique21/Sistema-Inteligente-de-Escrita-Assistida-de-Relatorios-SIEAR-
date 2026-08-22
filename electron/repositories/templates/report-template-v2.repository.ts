import type { ReportTemplateV2 } from '../../services/templates/report-template-v2.types'

export interface ReportTemplateV2Repository {
  create(template: ReportTemplateV2): Promise<ReportTemplateV2>
  getById(id: string): Promise<ReportTemplateV2 | null>
  getAll(): Promise<ReportTemplateV2[]>
  update(template: ReportTemplateV2): Promise<ReportTemplateV2>
  delete(id: string): Promise<void>
}
