import type {
  ActivityPattern,
  SectionRelationship,
  SemanticPattern,
  StructureField,
  StructurePattern,
} from '../../../src/domain/templates'
import type {
  DocumentRepresentation,
  DocumentStyle,
  ExtractedParagraph,
  ExtractedSection,
} from './types'

export interface DocumentAnalysisContext {
  document: DocumentRepresentation
  structure: StructurePattern | null
  semantic: SemanticPattern | null
  paragraphById: ReadonlyMap<string, ExtractedParagraph>
  sectionById: ReadonlyMap<string, ExtractedSection>
  fieldById: ReadonlyMap<string, StructureField>
  activityById: ReadonlyMap<string, ActivityPattern>
  styleById: ReadonlyMap<string, DocumentStyle>
  relationshipById: ReadonlyMap<string, SectionRelationship>
}

export interface DocumentAnalysisContextInput {
  structure?: StructurePattern | null
  semantic?: SemanticPattern | null
}

function normalizedId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function relationshipKey(
  sourceSection: string | null,
  relationship: SectionRelationship,
  index: number,
): string {
  return [
    sourceSection ? normalizedId(sourceSection) : 'cross',
    normalizedId(relationship.targetSection),
    normalizedId(relationship.relationship),
    index,
  ].join(':')
}

export function createDocumentAnalysisContext(
  document: DocumentRepresentation,
  input: DocumentAnalysisContextInput = {},
): DocumentAnalysisContext {
  const fieldById = new Map<string, StructureField>()
  for (const field of input.structure?.fields ?? []) fieldById.set(field.name, field)

  const activityById = new Map<string, ActivityPattern>()
  for (const activity of input.structure?.activityPatterns ?? [])
    activityById.set(
      `${normalizedId(activity.namePattern)}:${activity.order}`,
      activity,
    )

  const relationshipById = new Map<string, SectionRelationship>()
  for (const [sectionIndex, section] of (
    input.semantic?.sections ?? []
  ).entries()) {
    for (const [index, relationship] of section.relationships.entries()) {
      relationshipById.set(
        relationshipKey(section.sectionName, relationship, sectionIndex + index),
        relationship,
      )
    }
  }
  for (const [index, relationship] of (
    input.semantic?.crossSectionRelations ?? []
  ).entries()) {
    relationshipById.set(relationshipKey(null, relationship, index), relationship)
  }

  return Object.freeze({
    document,
    structure: input.structure ?? null,
    semantic: input.semantic ?? null,
    paragraphById: new Map(
      (document.paragraphs ?? []).map((paragraph) => [
        paragraph.id,
        paragraph,
      ]),
    ),
    sectionById: new Map(
      (document.sections ?? []).map((section) => [section.id, section]),
    ),
    fieldById,
    activityById,
    styleById: new Map((document.styles ?? []).map((style) => [style.id, style])),
    relationshipById,
  })
}

export function isDocumentAnalysisContext(
  value: unknown,
): value is DocumentAnalysisContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'document' in value &&
    'paragraphById' in value &&
    value.paragraphById instanceof Map
  )
}

export function asDocumentAnalysisContext(
  value: DocumentRepresentation | DocumentAnalysisContext,
): DocumentAnalysisContext {
  return isDocumentAnalysisContext(value)
    ? value
    : createDocumentAnalysisContext(value)
}
