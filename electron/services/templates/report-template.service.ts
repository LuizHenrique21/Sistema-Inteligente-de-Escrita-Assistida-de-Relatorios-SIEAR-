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

function optionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value)
}

function validHierarchy(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every((node: unknown) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node))
      return false
    const item = node as Record<string, unknown>
    return typeof item.sectionId === 'string' && validHierarchy(item.children)
  })
}

function validActivityPatterns(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every((pattern: unknown) => {
    if (
      typeof pattern !== 'object' ||
      pattern === null ||
      Array.isArray(pattern)
    )
      return false
    const item = pattern as Record<string, unknown>
    return (
      typeof item.namePattern === 'string' &&
      isStringArray(item.sectionNames) &&
      typeof item.order === 'number' &&
      Number.isInteger(item.order) &&
      typeof item.repeatable === 'boolean' &&
      isStringArray(item.fieldIds)
    )
  })
}

export function isReportTemplate(value: unknown): value is ReportTemplate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const template = value as Record<string, unknown>
  if (!Array.isArray(template.sections)) return false
  if (!Array.isArray(template.fields)) return false

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
      Number.isInteger(section.order) &&
      (section.parentSectionId === undefined ||
        section.parentSectionId === null ||
        typeof section.parentSectionId === 'string') &&
      (section.level === undefined ||
        (typeof section.level === 'number' &&
          Number.isInteger(section.level) &&
          section.level > 0)) &&
      (section.repeatable === undefined ||
        typeof section.repeatable === 'boolean') &&
      (section.semanticPurpose === undefined ||
        typeof section.semanticPurpose === 'string') &&
      (section.writingStyle === undefined ||
        typeof section.writingStyle === 'string') &&
      (section.formattingStyle === undefined ||
        typeof section.formattingStyle === 'string')
    )
  })

  const validFields = template.fields.every((value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }
    const field = value as Record<string, unknown>
    return (
      typeof field.id === 'string' &&
      typeof field.name === 'string' &&
      typeof field.label === 'string' &&
      (field.type === 'text' ||
        field.type === 'date' ||
        field.type === 'number' ||
        field.type === 'boolean') &&
      typeof field.required === 'boolean' &&
      typeof field.description === 'string'
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
    validFields &&
    isStringArray(template.writingRules) &&
    isStringArray(template.recommendedVocabulary) &&
    isStringArray(template.forbiddenExpressions) &&
    (template.documentType === undefined ||
      typeof template.documentType === 'string') &&
    (template.status === undefined ||
      template.status === 'draft' ||
      template.status === 'confirmed') &&
    optionalStringArray(template.semanticRules) &&
    optionalStringArray(template.formattingRules) &&
    optionalStringArray(template.requiredElements) &&
    optionalStringArray(template.optionalElements) &&
    optionalStringArray(template.repeatableElements) &&
    validHierarchy(template.hierarchy) &&
    validActivityPatterns(template.activityPatterns)
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
  if (template.status === 'draft') {
    throw new ReportTemplateServiceError(
      'VALIDATION_ERROR',
      'O modelo precisa ser confirmado após a revisão antes de ser salvo.',
    )
  }

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
  const sectionById = new Map(
    template.sections.map((section) => [section.id, section]),
  )
  for (const section of template.sections) {
    const visited = new Set([section.id])
    let parentId = section.parentSectionId
    while (parentId) {
      if (visited.has(parentId)) {
        throw new ReportTemplateServiceError(
          'VALIDATION_ERROR',
          `A hierarquia da seção "${section.name}" contém um ciclo.`,
        )
      }
      visited.add(parentId)
      parentId = sectionById.get(parentId)?.parentSectionId
    }
  }
  for (const section of template.sections) {
    if (section.parentSectionId && !sectionIds.has(section.parentSectionId)) {
      throw new ReportTemplateServiceError(
        'VALIDATION_ERROR',
        `A seção pai de "${section.name}" não existe.`,
      )
    }
  }

  const fieldIds = new Set<string>()
  for (const field of template.fields) {
    requireText(field.id, 'ID do campo')
    requireText(field.name, 'Nome do campo')
    if (fieldIds.has(field.id)) {
      throw new ReportTemplateServiceError(
        'DUPLICATE_ID',
        `O ID de campo "${field.id}" está duplicado.`,
      )
    }
    fieldIds.add(field.id)
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
        semanticPurpose: section.semanticPurpose?.trim(),
        writingStyle: section.writingStyle?.trim(),
        formattingStyle: section.formattingStyle?.trim(),
      }))
      .sort((first, second) => first.order - second.order),
    fields: template.fields.map((field) => ({
      ...field,
      id: field.id.trim(),
      name: field.name.trim(),
      label: field.label.trim(),
      description: field.description.trim(),
    })),
    documentType: template.documentType?.trim(),
    semanticRules: template.semanticRules
      ?.map((rule) => rule.trim())
      .filter(Boolean),
    formattingRules: template.formattingRules
      ?.map((rule) => rule.trim())
      .filter(Boolean),
    requiredElements: template.requiredElements
      ?.map((item) => item.trim())
      .filter(Boolean),
    optionalElements: template.optionalElements
      ?.map((item) => item.trim())
      .filter(Boolean),
    repeatableElements: template.repeatableElements
      ?.map((item) => item.trim())
      .filter(Boolean),
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
