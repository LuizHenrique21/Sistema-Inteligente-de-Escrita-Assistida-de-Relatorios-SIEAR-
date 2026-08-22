import type { ReportTemplate } from '../types/report-template'

export const templatesService = {
  getAll: () => window.siear.templates.getAll(),
  create: (template: ReportTemplate) => window.siear.templates.create(template),
  update: (id: string, template: ReportTemplate) =>
    window.siear.templates.update(id, template),
  delete: (id: string) => window.siear.templates.delete(id),
}
