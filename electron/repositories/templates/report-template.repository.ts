import type { ReportTemplate } from '../../../src/types/report-template'

export interface ReportTemplateRepository {
  findAll(): Promise<ReportTemplate[]>
  findById(id: string): Promise<ReportTemplate | null>
  create(template: ReportTemplate): Promise<ReportTemplate>
  update(id: string, template: ReportTemplate): Promise<ReportTemplate | null>
  delete(id: string): Promise<boolean>
}
