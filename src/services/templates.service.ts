import type { ReportTemplate } from '../domain/templates/report-template'
import type { TemplatesResult } from '../types/templates'

export const templatesService = {
  createFromDocument: () => window.siear.templates.createFromDocument(),
  onCreationProgress: window.siear.templates.onCreationProgress,
  getAll: () => window.siear.templates.getAll(),
  getById: (id: string) => window.siear.templates.getById(id),
  update: (
    template: ReportTemplate,
  ): Promise<TemplatesResult<ReportTemplate>> =>
    window.siear.templates.update(template),
  confirm: (id: string) => window.siear.templates.confirm(id),
  delete: (id: string) => window.siear.templates.delete(id),
}
