import type { ReportTemplate } from '../../../src/types/report-template'
import type { ReportTemplateRepository } from '../../repositories/templates/report-template.repository'

export type ReportTemplateServiceErrorCode =
  'VALIDATION_ERROR' | 'NOT_FOUND' | 'DUPLICATE_ID'

export class ReportTemplateServiceError extends Error {
  constructor(
    public readonly code: ReportTemplateServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ReportTemplateServiceError'
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isReportTemplate(value: unknown): value is ReportTemplate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const template = value as Record<string, unknown>
  if (!Array.isArray(template.sections)) return false

  const validSections = template.sections.every((value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }
    const section = value as Record<string, unknown>
    return (
      typeof section.id === 'string' &&
      typeof section.name === 'string' &&
      typeof section.description === 'string' &&
      typeof section.required === 'boolean' &&
      typeof section.order === 'number' &&
      Number.isInteger(section.order)
    )
  })

  return (
    typeof template.id === 'string' &&
    typeof template.name === 'string' &&
    typeof template.description === 'string' &&
    typeof template.objective === 'string' &&
    typeof template.tone === 'string' &&
    typeof template.style === 'string' &&
    (template.formality === 'low' ||
      template.formality === 'medium' ||
      template.formality === 'high') &&
    validSections &&
    isStringArray(template.writingRules) &&
    isStringArray(template.recommendedVocabulary) &&
    isStringArray(template.forbiddenExpressions)
  )
}

function requireText(value: string, field: string): void {
  if (value.trim() === '') {
    throw new ReportTemplateServiceError(
      'VALIDATION_ERROR',
      `${field} é obrigatório.`,
    )
  }
}

function validateTemplate(template: ReportTemplate): void {
  requireText(template.id, 'ID do modelo')
  requireText(template.name, 'Nome')
  requireText(template.description, 'Descrição')
  requireText(template.objective, 'Objetivo')

  if (template.sections.length === 0) {
    throw new ReportTemplateServiceError(
      'VALIDATION_ERROR',
      'O modelo deve possuir pelo menos uma seção.',
    )
  }

  const sectionIds = new Set<string>()
  const sectionOrders = new Set<number>()
  for (const section of template.sections) {
    requireText(section.id, 'ID da seção')
    requireText(section.name, 'Nome da seção')

    if (sectionIds.has(section.id)) {
      throw new ReportTemplateServiceError(
        'DUPLICATE_ID',
        `O ID de seção "${section.id}" está duplicado.`,
      )
    }
    if (sectionOrders.has(section.order)) {
      throw new ReportTemplateServiceError(
        'VALIDATION_ERROR',
        `A ordem ${section.order} está duplicada.`,
      )
    }
    sectionIds.add(section.id)
    sectionOrders.add(section.order)
  }
}

function normalizeTemplate(template: ReportTemplate): ReportTemplate {
  return {
    ...structuredClone(template),
    id: template.id.trim(),
    name: template.name.trim(),
    description: template.description.trim(),
    objective: template.objective.trim(),
    tone: template.tone.trim(),
    style: template.style.trim(),
    sections: template.sections
      .map((section) => ({
        ...section,
        id: section.id.trim(),
        name: section.name.trim(),
        description: section.description.trim(),
      }))
      .sort((first, second) => first.order - second.order),
  }
}

export class ReportTemplateService {
  constructor(private readonly repository: ReportTemplateRepository) {}

  getAll(): Promise<ReportTemplate[]> {
    return this.repository.findAll()
  }

  getById(id: string): Promise<ReportTemplate | null> {
    return this.repository.findById(id)
  }

  async create(template: ReportTemplate): Promise<ReportTemplate> {
    const normalized = normalizeTemplate(template)
    validateTemplate(normalized)
    if (await this.repository.findById(normalized.id)) {
      throw new ReportTemplateServiceError(
        'DUPLICATE_ID',
        `Já existe um modelo com o ID "${normalized.id}".`,
      )
    }
    return this.repository.create(normalized)
  }

  async update(id: string, template: ReportTemplate): Promise<ReportTemplate> {
    if (id !== template.id) {
      throw new ReportTemplateServiceError(
        'VALIDATION_ERROR',
        'O ID do modelo não pode ser alterado.',
      )
    }
    const normalized = normalizeTemplate(template)
    validateTemplate(normalized)
    const updated = await this.repository.update(id, normalized)
    if (!updated) {
      throw new ReportTemplateServiceError(
        'NOT_FOUND',
        'Modelo de relatório não encontrado.',
      )
    }
    return updated
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.repository.delete(id)
    if (!deleted) {
      throw new ReportTemplateServiceError(
        'NOT_FOUND',
        'Modelo de relatório não encontrado.',
      )
    }
    return true
  }
}
