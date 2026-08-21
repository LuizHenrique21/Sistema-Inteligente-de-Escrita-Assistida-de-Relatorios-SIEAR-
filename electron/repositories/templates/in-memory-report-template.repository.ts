import type { ReportTemplate } from '../../../src/types/report-template'
import type { ReportTemplateRepository } from './report-template.repository'

function cloneTemplate(template: ReportTemplate): ReportTemplate {
  return structuredClone(template)
}

export class InMemoryReportTemplateRepository
  implements ReportTemplateRepository
{
  private readonly templates = new Map<string, ReportTemplate>()

  constructor(initialTemplates: ReportTemplate[] = []) {
    for (const template of initialTemplates) {
      this.templates.set(template.id, cloneTemplate(template))
    }
  }

  async findAll(): Promise<ReportTemplate[]> {
    return [...this.templates.values()].map(cloneTemplate)
  }

  async findById(id: string): Promise<ReportTemplate | null> {
    const template = this.templates.get(id)
    return template ? cloneTemplate(template) : null
  }

  async create(template: ReportTemplate): Promise<ReportTemplate> {
    this.templates.set(template.id, cloneTemplate(template))
    return cloneTemplate(template)
  }

  async update(
    id: string,
    template: ReportTemplate,
  ): Promise<ReportTemplate | null> {
    if (!this.templates.has(id)) return null
    this.templates.set(id, cloneTemplate(template))
    return cloneTemplate(template)
  }

  async delete(id: string): Promise<boolean> {
    return this.templates.delete(id)
  }
}
