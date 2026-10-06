import type {
  SemanticEvidence,
  SemanticPattern,
  SemanticRule,
} from '../../../../src/domain/templates'
import type {
  GlobalSemanticResult,
  SectionSemanticResult,
  SemanticRelationsResult,
} from './semantic-contract'
import type {
  SemanticAnalysisContext,
  SemanticSectionContext,
} from './semantic-context'

function evidence(
  context: SemanticAnalysisContext,
  ids: string[],
): SemanticEvidence[] {
  return ids.map((id) => {
    const source = context.evidenceById.get(id)
    if (!source) throw new TypeError(`Unknown semantic evidence: ${id}`)
    return {
      sectionName: source.sectionId
        ? (context.sectionById.get(source.sectionId)?.originalName ?? null)
        : null,
      excerpt: source.text,
      reason: 'Evidencia referenciada pela analise semantica.',
    }
  })
}

function supports(
  context: SemanticAnalysisContext,
  ids: string[],
): SemanticEvidence[] {
  const evidenceIds = ids.flatMap((id) => {
    const field = context.fields.find((item) => item.fieldId === id)
    return field ? field.evidenceIds : [id]
  })
  return evidence(context, [...new Set(evidenceIds)])
}

function rules(
  context: SemanticAnalysisContext,
  values: Array<{ rule: string; justification: string; evidenceIds: string[] }>,
): SemanticRule[] {
  return values.map((value) => ({
    rule: value.rule,
    justification: value.justification,
    evidence: evidence(context, value.evidenceIds),
  }))
}

function style(
  context: SemanticAnalysisContext,
  section: SemanticSectionContext,
): { narrativePattern: string; detailLevel: string } {
  return {
    narrativePattern:
      section.writingStyleSummary?.narrativeStyle ??
      context.writingProfile.narrativeStyle,
    detailLevel:
      section.writingStyleSummary?.detailLevel ??
      context.writingProfile.detailLevel,
  }
}

export function consolidateSemantic(
  context: SemanticAnalysisContext,
  global: GlobalSemanticResult,
  sections: SectionSemanticResult[],
  relationResult: SemanticRelationsResult,
): SemanticPattern {
  const resultById = new Map(sections.map((section) => [section.sectionId, section]))
  if (resultById.size !== context.sections.length)
    throw new TypeError('Semantic consolidation received missing or duplicate sections.')
  const semanticSections = context.sections.map((section) => {
    const result = resultById.get(section.sectionId)
    if (!result) throw new TypeError(`Missing semantic section: ${section.sectionId}`)
    const outgoing = relationResult.relations.filter(
      (relation) => relation.sourceSectionId === section.sectionId,
    )
    return {
      sectionName: section.originalName,
      purpose: result.purpose,
      expectedInformation: result.expectedInformation.map((information) => ({
        name: information.name,
        description: information.description,
        informationType: information.informationType,
        required: information.requirement === 'required',
        evidence: supports(context, information.supportIds),
      })),
      excludedInformation: rules(context, result.excludedInformation),
      informationOrder: result.expectedInformation.map((item) => item.name),
      relationships: outgoing.map((relation) => ({
        sourceSection: section.originalName,
        targetSection:
          context.sectionById.get(relation.targetSectionId)!.originalName,
        relationship: relation.relationType,
        evidence: [],
      })),
      ...style(context, section),
      evidence: evidence(context, result.evidenceIds),
    }
  })
  const fieldRoleById = new Map(
    global.fieldRoles.map((field) => [field.fieldId, field]),
  )
  return {
    documentType: context.documentType,
    globalProfile: {
      documentPurpose: global.documentPurpose,
      overallInformationFlow: global.overallInformationFlow.map(
        (sectionId) => context.sectionById.get(sectionId)!.originalName,
      ),
      generalSemanticRules: rules(context, global.generalSemanticRules),
    },
    sections: semanticSections,
    activityPatterns: context.structure.activityPatterns.map((activity) => ({
      namePattern: activity.namePattern,
      occurrenceCount: context.sections.filter((section) => section.repeatable)
        .length,
      sectionSequence: activity.sections.slice(),
      semanticFlow: activity.sections.slice(),
      evidence: [],
    })),
    fields: context.fields.map((field) => {
      const role = fieldRoleById.get(field.fieldId)
      if (!role) throw new TypeError(`Missing semantic field: ${field.fieldId}`)
      return {
        name: field.name,
        label: field.label,
        semanticRole: role.semanticRole,
        valueType: field.valueType,
        required: field.required,
        evidence: evidence(context, role.evidenceIds),
      }
    }),
    crossSectionRelations: relationResult.relations.map((relation) => ({
      sourceSection:
        context.sectionById.get(relation.sourceSectionId)!.originalName,
      targetSection:
        context.sectionById.get(relation.targetSectionId)!.originalName,
      relationship: relation.relationType,
      evidence: [],
    })),
    uncertainties: [],
  }
}
