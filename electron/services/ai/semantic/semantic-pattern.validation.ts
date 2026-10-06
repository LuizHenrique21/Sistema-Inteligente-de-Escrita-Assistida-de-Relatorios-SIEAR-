import type {
  SemanticEvidence,
  SemanticPattern,
} from '../../../../src/domain/templates'
import type { SemanticAnalysisContext } from './semantic-context'
import { INFORMATION_TYPES, RELATION_TYPES } from './semantic-contract'

const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => Object.hasOwn(value, key))

function validEvidence(
  value: unknown,
  context: SemanticAnalysisContext,
): value is SemanticEvidence {
  if (!record(value) || !exact(value, ['sectionName', 'excerpt', 'reason']))
    return false
  if (!(value.sectionName === null || text(value.sectionName))) return false
  if (!text(value.excerpt) || !text(value.reason)) return false
  return [...context.evidenceById.values()].some(
    (source) =>
      source.text === value.excerpt &&
      (source.sectionId
        ? context.sectionById.get(source.sectionId)?.originalName ===
          value.sectionName
        : value.sectionName === null),
  )
}

function validRule(value: unknown, context: SemanticAnalysisContext): boolean {
  return (
    record(value) &&
    exact(value, ['rule', 'justification', 'evidence']) &&
    text(value.rule) &&
    text(value.justification) &&
    Array.isArray(value.evidence) &&
    value.evidence.length > 0 &&
    value.evidence.every((item) => validEvidence(item, context))
  )
}

export function isSemanticPattern(
  value: unknown,
  context: SemanticAnalysisContext,
): value is SemanticPattern {
  if (!record(value)) return false
  const rootKeys = [
    'documentType',
    'globalProfile',
    'sections',
    'activityPatterns',
    'fields',
    'crossSectionRelations',
    'uncertainties',
  ]
  if (!exact(value, rootKeys) || value.documentType !== context.documentType)
    return false
  if (!record(value.globalProfile)) return false
  const global = value.globalProfile
  if (
    !exact(global, [
      'documentPurpose',
      'overallInformationFlow',
      'generalSemanticRules',
    ]) ||
    !text(global.documentPurpose) ||
    !Array.isArray(global.overallInformationFlow) ||
    !global.overallInformationFlow.every((name) =>
      context.sections.some((section) => section.originalName === name),
    ) ||
    !Array.isArray(global.generalSemanticRules) ||
    !global.generalSemanticRules.every((rule) => validRule(rule, context))
  )
    return false
  if (!Array.isArray(value.sections) || value.sections.length !== context.sections.length)
    return false
  const names = new Set<string>()
  for (const sectionValue of value.sections) {
    if (!record(sectionValue)) return false
    if (
      !exact(sectionValue, [
        'sectionName',
        'purpose',
        'expectedInformation',
        'excludedInformation',
        'informationOrder',
        'relationships',
        'narrativePattern',
        'detailLevel',
        'evidence',
      ]) ||
      !text(sectionValue.sectionName) ||
      names.has(sectionValue.sectionName) ||
      !context.sections.some((section) => section.originalName === sectionValue.sectionName) ||
      !text(sectionValue.purpose) ||
      !text(sectionValue.narrativePattern) ||
      !text(sectionValue.detailLevel) ||
      !Array.isArray(sectionValue.evidence) ||
      sectionValue.evidence.length === 0 ||
      !sectionValue.evidence.every((item) => validEvidence(item, context)) ||
      !Array.isArray(sectionValue.expectedInformation) ||
      !Array.isArray(sectionValue.excludedInformation) ||
      !sectionValue.excludedInformation.every((rule) => validRule(rule, context)) ||
      !Array.isArray(sectionValue.informationOrder) ||
      !sectionValue.informationOrder.every(text) ||
      !Array.isArray(sectionValue.relationships)
    )
      return false
    names.add(sectionValue.sectionName)
    for (const information of sectionValue.expectedInformation) {
      if (
        !record(information) ||
        !exact(information, [
          'name',
          'description',
          'informationType',
          'required',
          'evidence',
        ]) ||
        !text(information.name) ||
        !text(information.description) ||
        !INFORMATION_TYPES.includes(
          information.informationType as (typeof INFORMATION_TYPES)[number],
        ) ||
        typeof information.required !== 'boolean' ||
        !Array.isArray(information.evidence) ||
        information.evidence.length === 0 ||
        !information.evidence.every((item) => validEvidence(item, context))
      )
        return false
    }
    for (const relationship of sectionValue.relationships) {
      if (!validRelationship(relationship, context, sectionValue.sectionName))
        return false
    }
  }
  if (
    !context.sections.every((section) => names.has(section.originalName)) ||
    !Array.isArray(value.fields) ||
    value.fields.length !== context.fields.length
  )
    return false
  for (const fieldValue of value.fields) {
    if (!record(fieldValue)) return false
    const field = context.fields.find((item) => item.name === fieldValue.name)
    if (
      !field ||
      !exact(fieldValue, [
        'name',
        'label',
        'semanticRole',
        'valueType',
        'required',
        'evidence',
      ]) ||
      fieldValue.label !== field.label ||
      fieldValue.valueType !== field.valueType ||
      fieldValue.required !== field.required ||
      !text(fieldValue.semanticRole) ||
      !Array.isArray(fieldValue.evidence) ||
      !fieldValue.evidence.every((item) => validEvidence(item, context))
    )
      return false
  }
  return (
    Array.isArray(value.activityPatterns) &&
    Array.isArray(value.crossSectionRelations) &&
    value.crossSectionRelations.every((relation) =>
      validRelationship(relation, context),
    ) &&
    Array.isArray(value.uncertainties) &&
    value.uncertainties.every((rule) => validRule(rule, context))
  )
}

function validRelationship(
  value: unknown,
  context: SemanticAnalysisContext,
  implicitSource?: string,
): boolean {
  if (!record(value)) return false
  const allowedKeys = ['sourceSection', 'targetSection', 'relationship', 'evidence']
  const requiredKeys = implicitSource
    ? ['targetSection', 'relationship', 'evidence']
    : allowedKeys
  if (
    !Object.keys(value).every((key) => allowedKeys.includes(key)) ||
    !requiredKeys.every((key) => Object.hasOwn(value, key)) ||
    !text(value.targetSection) ||
    !context.sections.some((section) => section.originalName === value.targetSection) ||
    !text(value.relationship) ||
    !RELATION_TYPES.includes(value.relationship as (typeof RELATION_TYPES)[number]) ||
    !Array.isArray(value.evidence) ||
    !value.evidence.every((item) => validEvidence(item, context))
  )
    return false
  const source = implicitSource ?? value.sourceSection
  return (
    text(source) &&
    source !== value.targetSection &&
    context.sections.some((section) => section.originalName === source)
  )
}
