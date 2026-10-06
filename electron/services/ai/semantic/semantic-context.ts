import type {
  StructureFieldType,
  StructurePattern,
  WritingPattern,
} from '../../../../src/domain/templates'
import type { DocumentRepresentation } from '../../documents/types'
import { hashCheckpointResult } from '../../templates/pipeline-checkpoint.hash'
import { createWritingContext } from '../writing/writing-context'

export interface SemanticEvidenceContext {
  evidenceId: string
  sectionId: string | null
  text: string
}
export interface SemanticFieldContext {
  fieldId: string
  name: string
  label: string
  valueType: StructureFieldType
  required: boolean
  evidenceIds: string[]
}
export interface SemanticSectionContext {
  sectionId: string
  canonicalName: string
  originalName: string
  level: number
  order: number
  structuralPurpose: string | null
  structurallyRequired: boolean
  repeatable: boolean
  samples: SemanticEvidenceContext[]
  evidenceIds: string[]
  supportIds: string[]
  requiredSupportIds: string[]
  writingStyleSummary: {
    narrativeStyle: string
    detailLevel: string
  } | null
}
export interface SemanticAnalysisContext {
  documentId: string
  documentType: string
  sections: SemanticSectionContext[]
  sectionById: Map<string, SemanticSectionContext>
  allowedSectionIds: string[]
  evidenceById: Map<string, SemanticEvidenceContext>
  allowedEvidenceIds: string[]
  globalEvidenceIds: string[]
  fields: SemanticFieldContext[]
  writingProfile: {
    narrativeStyle: string
    detailLevel: string
  }
  structure: StructurePattern
}

function sectionIdForTitle(
  title: string | null,
  sections: SemanticSectionContext[],
): string | null {
  if (title === null) return null
  return sections.find((section) => section.originalName === title)?.sectionId ?? null
}

export function createSemanticContext(
  document: DocumentRepresentation,
  structure: StructurePattern,
  writing: WritingPattern,
): SemanticAnalysisContext {
  // Reuse the exact section identity established by WritingAnalysis.
  const writingContext = createWritingContext(document, structure)
  const sections: SemanticSectionContext[] = writingContext.sections.map(
    (source) => {
      const structural = structure.sections.find(
        (section) => section.name === source.originalName,
      )
      const style = writing.sectionStyles.find(
        (section) => section.sectionName === source.originalName,
      )
      return {
        sectionId: source.sectionId,
        canonicalName: source.canonicalName,
        originalName: source.originalName,
        level: structural?.level ?? 1,
        order: structural?.order ?? 0,
        structuralPurpose: structural?.purpose ?? null,
        structurallyRequired: structural?.required ?? false,
        repeatable: structural?.repeatable ?? false,
        samples: source.samples.map((sample) => ({
          evidenceId: sample.id,
          sectionId: source.sectionId,
          text: sample.text,
        })),
        evidenceIds: source.allowedEvidenceIds.slice(),
        supportIds: source.allowedEvidenceIds.slice(),
        requiredSupportIds: [],
        writingStyleSummary: style
          ? {
              narrativeStyle: style.narrativeStyle,
              detailLevel: style.detailLevel,
            }
          : null,
      }
    },
  )
  const evidenceById = new Map<string, SemanticEvidenceContext>()
  for (const section of sections)
    for (const evidence of section.samples)
      evidenceById.set(evidence.evidenceId, evidence)

  const fields: SemanticFieldContext[] = structure.fields.map((field, index) => {
    const fieldId = `field-${String(index + 1).padStart(3, '0')}`
    const evidenceIds = field.evidence.map((evidence, evidenceIndex) => {
      const paragraph = document.paragraphs.find(
        (item) => item.id === evidence.elementId,
      )
      const documentSection = document.sections.find(
        (item) => item.id === paragraph?.sectionId,
      )
      const sectionId = sectionIdForTitle(documentSection?.title ?? null, sections)
      const evidenceId = `${fieldId}-evidence-${evidenceIndex + 1}`
      evidenceById.set(evidenceId, {
        evidenceId,
        sectionId,
        text: evidence.excerpt,
      })
      if (sectionId) {
        const section = sections.find((item) => item.sectionId === sectionId)!
        section.evidenceIds.push(evidenceId)
        section.supportIds.push(fieldId)
        if (field.required) section.requiredSupportIds.push(fieldId)
      }
      return evidenceId
    })
    return {
      fieldId,
      name: field.name,
      label: field.label,
      valueType: field.type,
      required: field.required,
      evidenceIds,
    }
  })
  const allowedEvidenceIds = [...evidenceById.keys()]
  const globalEvidenceIds = [
    ...writingContext.globalSamples.map((sample) => sample.id),
    ...fields.flatMap((field) => field.evidenceIds),
  ]
  return {
    documentId: hashCheckpointResult({
      sourceDocumentId: writingContext.documentId,
      documentType: structure.documentType,
      sections: sections.map((section) => ({
        sectionId: section.sectionId,
        structuralPurpose: section.structuralPurpose,
        evidenceIds: section.evidenceIds,
      })),
      fields,
    }),
    documentType: structure.documentType,
    sections,
    sectionById: new Map(sections.map((section) => [section.sectionId, section])),
    allowedSectionIds: sections.map((section) => section.sectionId),
    evidenceById,
    allowedEvidenceIds,
    globalEvidenceIds: [...new Set(globalEvidenceIds)],
    fields,
    writingProfile: {
      narrativeStyle: writing.globalStyle.narrativeStyle,
      detailLevel: writing.globalStyle.detailLevel,
    },
    structure,
  }
}
