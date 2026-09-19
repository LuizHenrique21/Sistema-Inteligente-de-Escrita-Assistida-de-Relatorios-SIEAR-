import type { SemanticAnalysisInput } from './prompts/semantic-analysis.prompt'
import {
  buildSemanticAnalysisInput,
  buildSemanticAnalysisPrompt,
} from './prompts/semantic-analysis.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'
import type {
  ActivitySemanticPattern,
  ExpectedInformation,
  SectionRelationship,
  SectionSemanticPattern,
  SemanticEvidence,
  SemanticFieldPattern,
  SemanticPattern,
  SemanticRule,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'

const ROOT_KEYS = [
  'documentType',
  'sections',
  'activityPatterns',
  'fields',
  'crossSectionRelations',
  'uncertainties',
] as const
const SECTION_KEYS = [
  'sectionName',
  'purpose',
  'expectedInformation',
  'excludedInformation',
  'informationOrder',
  'relationships',
  'narrativePattern',
  'detailLevel',
  'evidence',
] as const
const INFORMATION_TYPES = new Set([
  'context',
  'fact',
  'action',
  'cause',
  'procedure',
  'result',
  'validation',
  'field',
  'other',
])

const EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    sectionName: { type: ['string', 'null'] },
    excerpt: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['sectionName', 'excerpt', 'reason'],
  additionalProperties: false,
}
const RULE_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    justification: { type: 'string' },
    evidence: { type: 'array', items: EVIDENCE_SCHEMA },
  },
  required: ['rule', 'justification', 'evidence'],
  additionalProperties: false,
}
const RELATIONSHIP_SCHEMA = {
  type: 'object',
  properties: {
    targetSection: { type: 'string' },
    relationship: { type: 'string' },
    evidence: { type: 'array', items: EVIDENCE_SCHEMA },
  },
  required: ['targetSection', 'relationship', 'evidence'],
  additionalProperties: false,
}
const SEMANTIC_PATTERN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    documentType: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sectionName: { type: 'string' },
          purpose: { type: 'string' },
          expectedInformation: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                informationType: {
                  type: 'string',
                  enum: [...INFORMATION_TYPES],
                },
                required: { type: 'boolean' },
                evidence: { type: 'array', items: EVIDENCE_SCHEMA },
              },
              required: [
                'name',
                'description',
                'informationType',
                'required',
                'evidence',
              ],
              additionalProperties: false,
            },
          },
          excludedInformation: { type: 'array', items: RULE_SCHEMA },
          informationOrder: { type: 'array', items: { type: 'string' } },
          relationships: { type: 'array', items: RELATIONSHIP_SCHEMA },
          narrativePattern: { type: 'string' },
          detailLevel: { type: 'string' },
          evidence: { type: 'array', items: EVIDENCE_SCHEMA },
        },
        required: [...SECTION_KEYS],
        additionalProperties: false,
      },
    },
    activityPatterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          namePattern: { type: 'string' },
          occurrenceCount: { type: 'integer', minimum: 1 },
          sectionSequence: { type: 'array', items: { type: 'string' } },
          semanticFlow: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: EVIDENCE_SCHEMA },
        },
        required: [
          'namePattern',
          'occurrenceCount',
          'sectionSequence',
          'semanticFlow',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          semanticRole: { type: 'string' },
          valueType: {
            type: 'string',
            enum: ['text', 'date', 'number', 'boolean'],
          },
          required: { type: 'boolean' },
          evidence: { type: 'array', items: EVIDENCE_SCHEMA },
        },
        required: [
          'name',
          'label',
          'semanticRole',
          'valueType',
          'required',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
    crossSectionRelations: { type: 'array', items: RELATIONSHIP_SCHEMA },
    uncertainties: { type: 'array', items: RULE_SCHEMA },
  },
  required: [...ROOT_KEYS],
  additionalProperties: false,
}

export class SemanticAnalysisError extends Error {
  readonly code = 'INVALID_SEMANTIC_ANALYSIS' as const
  constructor(message: string) {
    super(message)
    this.name = 'SemanticAnalysisError'
  }
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function evidenceSources(
  input: SemanticAnalysisInput,
  sectionName: string | null,
): string[] {
  const samples =
    sectionName === null
      ? input.sections.flatMap((section) => section.samples)
      : (input.sections.find((section) => section.name === sectionName)
          ?.samples ?? [])
  const fields = input.fieldCandidates
    .flatMap((field) => field.evidence)
    .filter(
      (evidence) =>
        sectionName === null || evidence.sectionName === sectionName,
    )
    .map((evidence) => evidence.excerpt)
  return [...samples, ...fields]
}

function validEvidence(
  value: unknown,
  input: SemanticAnalysisInput,
): value is SemanticEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    !exact(item, ['sectionName', 'excerpt', 'reason']) ||
    !(item.sectionName === null || text(item.sectionName)) ||
    !text(item.excerpt) ||
    !text(item.reason)
  )
    return false
  if (
    item.sectionName !== null &&
    !input.sections.some((section) => section.name === item.sectionName)
  )
    return false
  return evidenceSources(input, item.sectionName as string | null).some(
    (source) => source.includes(item.excerpt as string),
  )
}

function validRule(
  value: unknown,
  input: SemanticAnalysisInput,
): value is SemanticRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, ['rule', 'justification', 'evidence']) &&
    text(item.rule) &&
    text(item.justification) &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

function validRelationship(
  value: unknown,
  input: SemanticAnalysisInput,
): value is SectionRelationship {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, ['targetSection', 'relationship', 'evidence']) &&
    text(item.targetSection) &&
    input.sections.some((section) => section.name === item.targetSection) &&
    text(item.relationship) &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

function validExpected(
  value: unknown,
  input: SemanticAnalysisInput,
): value is ExpectedInformation {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, [
      'name',
      'description',
      'informationType',
      'required',
      'evidence',
    ]) &&
    text(item.name) &&
    text(item.description) &&
    typeof item.informationType === 'string' &&
    INFORMATION_TYPES.has(item.informationType) &&
    typeof item.required === 'boolean' &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

function validSection(
  value: unknown,
  input: SemanticAnalysisInput,
): value is SectionSemanticPattern {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, SECTION_KEYS) &&
    text(item.sectionName) &&
    input.sections.some((section) => section.name === item.sectionName) &&
    text(item.purpose) &&
    Array.isArray(item.expectedInformation) &&
    item.expectedInformation.every((entry) => validExpected(entry, input)) &&
    Array.isArray(item.excludedInformation) &&
    item.excludedInformation.every(
      (entry) =>
        validRule(entry, input) && (entry as SemanticRule).evidence.length > 0,
    ) &&
    Array.isArray(item.informationOrder) &&
    item.informationOrder.every(text) &&
    Array.isArray(item.relationships) &&
    item.relationships.every((entry) => validRelationship(entry, input)) &&
    text(item.narrativePattern) &&
    text(item.detailLevel) &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

function validField(
  value: unknown,
  input: SemanticAnalysisInput,
): value is SemanticFieldPattern {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  const candidate = input.fieldCandidates.find(
    (field) =>
      field.name === item.name &&
      field.label === item.label &&
      field.valueType === item.valueType,
  )
  return (
    exact(item, [
      'name',
      'label',
      'semanticRole',
      'valueType',
      'required',
      'evidence',
    ]) &&
    candidate !== undefined &&
    text(item.semanticRole) &&
    typeof item.required === 'boolean' &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

function validActivity(
  value: unknown,
  input: SemanticAnalysisInput,
): value is ActivitySemanticPattern {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  const source = input.activityPatterns.find(
    (activity) => activity.namePattern === item.namePattern,
  )
  return (
    exact(item, [
      'namePattern',
      'occurrenceCount',
      'sectionSequence',
      'semanticFlow',
      'evidence',
    ]) &&
    source !== undefined &&
    item.occurrenceCount === source.occurrenceCount &&
    Array.isArray(item.sectionSequence) &&
    item.sectionSequence.every(
      (name) => typeof name === 'string' && source.sections.includes(name),
    ) &&
    Array.isArray(item.semanticFlow) &&
    item.semanticFlow.every(text) &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

export function isSemanticPattern(
  value: unknown,
  input: SemanticAnalysisInput,
): value is SemanticPattern {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    !exact(item, ROOT_KEYS) ||
    !text(item.documentType) ||
    !Array.isArray(item.sections) ||
    !item.sections.every((entry) => validSection(entry, input))
  )
    return false
  const sectionNames = item.sections.map(
    (section) => (section as SectionSemanticPattern).sectionName,
  )
  const relevant = input.sections
    .filter((section) => section.samples.length > 0)
    .map((section) => section.name)
  if (
    new Set(sectionNames).size !== sectionNames.length ||
    sectionNames.length !== relevant.length ||
    !relevant.every((name) => sectionNames.includes(name))
  )
    return false
  return (
    Array.isArray(item.activityPatterns) &&
    item.activityPatterns.every((entry) => validActivity(entry, input)) &&
    Array.isArray(item.fields) &&
    item.fields.every((entry) => validField(entry, input)) &&
    Array.isArray(item.crossSectionRelations) &&
    item.crossSectionRelations.every((entry) =>
      validRelationship(entry, input),
    ) &&
    Array.isArray(item.uncertainties) &&
    item.uncertainties.every((entry) => validRule(entry, input))
  )
}

export class SemanticAnalysisService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async analyze(
    document: DocumentRepresentation,
    structure: StructurePattern,
    writing: WritingPattern,
  ): Promise<SemanticPattern> {
    const input = buildSemanticAnalysisInput(document, structure, writing)
    const response = await this.generator.generateJson(
      buildSemanticAnalysisPrompt(input),
      SEMANTIC_PATTERN_SCHEMA,
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new SemanticAnalysisError(
        'O Ollama retornou JSON inválido para a análise semântica.',
      )
    }
    if (!isSemanticPattern(parsed, input))
      throw new SemanticAnalysisError(
        'A análise semântica não corresponde ao contrato ou contém informações inventadas.',
      )
    return parsed
  }
}
