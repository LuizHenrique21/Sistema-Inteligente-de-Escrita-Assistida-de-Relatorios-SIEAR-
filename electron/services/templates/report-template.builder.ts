import { randomUUID } from 'node:crypto'
import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
  type ReportTemplateRequirements,
} from '../../../src/domain/templates/report-template'
import type { DocumentRepresentation } from '../documents/types'

export const REPORT_TEMPLATE_BUILDER_VERSION = '1' as const

export interface ReportTemplateBuilderInput {
  document: DocumentRepresentation
  structure: StructurePattern
  writing: WritingPattern
  semantic: SemanticPattern
  formatting: FormattingPattern
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function buildRequirements(
  structure: StructurePattern,
): ReportTemplateRequirements {
  return {
    requiredElements: [...structure.requiredElements],
    optionalElements: [...structure.optionalElements],
    repeatableElements: unique([
      ...structure.sections
        .filter((section) => section.repeatable)
        .map((section) => section.name),
      ...structure.activityPatterns
        .filter((activity) => activity.repeatable)
        .map((activity) => activity.namePattern),
      ...structure.recurringElements.map((element) => element.name),
    ]),
  }
}

export class ReportTemplateBuilder {
  build(input: ReportTemplateBuilderInput): ReportTemplate {
    const timestamp = new Date().toISOString()

    return {
      version: REPORT_TEMPLATE_VERSION,
      metadata: {
        id: randomUUID(),
        name: `Modelo de ${input.structure.documentType}`,
        description: `Padrão reutilizável aprendido a partir de um único documento do tipo ${input.structure.documentType}.`,
        documentType: input.structure.documentType,
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      structurePattern: structuredClone(input.structure),
      writingPattern: structuredClone(input.writing),
      semanticPattern: structuredClone(input.semantic),
      formattingPattern: structuredClone(input.formatting),
      fields: structuredClone(input.structure.fields),
      activityPatterns: structuredClone(input.structure.activityPatterns),
      requirements: buildRequirements(input.structure),
    }
  }
}
