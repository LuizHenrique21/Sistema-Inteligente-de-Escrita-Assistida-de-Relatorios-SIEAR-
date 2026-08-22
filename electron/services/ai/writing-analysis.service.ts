import type { StructurePattern } from '../documents/structure-analysis.types'
import type { DocumentRepresentation } from '../documents/types'
import type {
  SectionWritingStyle,
  WritingEvidence,
  WritingPattern,
  WritingRule,
  WritingStyleProfile,
} from '../documents/writing-analysis.types'
import type { StructuredTextGenerator } from './report-extraction.service'
import {
  buildWritingAnalysisInput,
  buildWritingAnalysisPrompt,
  type WritingAnalysisInput,
} from './prompts/writing-analysis.prompt'

const PROFILE_KEYS = [
  'tone',
  'formality',
  'technicality',
  'objectivity',
  'averageParagraphWords',
  'sentenceComplexity',
  'grammaticalPerson',
  'verbTense',
  'voice',
  'firstPersonUsage',
  'thirdPersonUsage',
  'detailLevel',
  'narrativeStyle',
  'evidence',
] as const
const SECTION_KEYS = [
  'sectionName',
  ...PROFILE_KEYS,
  'introductionPatterns',
  'developmentPatterns',
  'conclusionPatterns',
] as const
const ROOT_KEYS = [
  'globalStyle',
  'sectionStyles',
  'vocabulary',
  'terminology',
  'sentencePatterns',
  'paragraphPatterns',
  'narrativePatterns',
  'forbiddenPatterns',
  'recommendedPatterns',
] as const

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
const PROFILE_PROPERTIES = {
  tone: { type: 'string' },
  formality: { type: 'string' },
  technicality: { type: 'string' },
  objectivity: { type: 'string' },
  averageParagraphWords: { type: 'number', minimum: 0 },
  sentenceComplexity: { type: 'string' },
  grammaticalPerson: { type: 'string' },
  verbTense: { type: 'string' },
  voice: { type: 'string' },
  firstPersonUsage: { type: 'string' },
  thirdPersonUsage: { type: 'string' },
  detailLevel: { type: 'string' },
  narrativeStyle: { type: 'string' },
  evidence: { type: 'array', items: EVIDENCE_SCHEMA },
}
const WRITING_PATTERN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    globalStyle: {
      type: 'object',
      properties: PROFILE_PROPERTIES,
      required: [...PROFILE_KEYS],
      additionalProperties: false,
    },
    sectionStyles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sectionName: { type: 'string' },
          ...PROFILE_PROPERTIES,
          introductionPatterns: { type: 'array', items: RULE_SCHEMA },
          developmentPatterns: { type: 'array', items: RULE_SCHEMA },
          conclusionPatterns: { type: 'array', items: RULE_SCHEMA },
        },
        required: [...SECTION_KEYS],
        additionalProperties: false,
      },
    },
    vocabulary: { type: 'array', items: RULE_SCHEMA },
    terminology: { type: 'array', items: RULE_SCHEMA },
    sentencePatterns: { type: 'array', items: RULE_SCHEMA },
    paragraphPatterns: { type: 'array', items: RULE_SCHEMA },
    narrativePatterns: { type: 'array', items: RULE_SCHEMA },
    forbiddenPatterns: { type: 'array', items: RULE_SCHEMA },
    recommendedPatterns: { type: 'array', items: RULE_SCHEMA },
  },
  required: [...ROOT_KEYS],
  additionalProperties: false,
}

export class WritingAnalysisError extends Error {
  readonly code = 'INVALID_WRITING_ANALYSIS' as const
  constructor(message: string) {
    super(message)
    this.name = 'WritingAnalysisError'
  }
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function validEvidence(
  value: unknown,
  input: WritingAnalysisInput,
): value is WritingEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    !exactKeys(item, ['sectionName', 'excerpt', 'reason']) ||
    !(item.sectionName === null || nonEmpty(item.sectionName)) ||
    !nonEmpty(item.excerpt) ||
    !nonEmpty(item.reason)
  )
    return false
  const candidates =
    item.sectionName === null
      ? input.sections.flatMap((section) => section.samples)
      : input.sections.find((section) => section.name === item.sectionName)
          ?.samples
  return (
    candidates !== undefined &&
    candidates.some((sample) => sample.includes(item.excerpt as string))
  )
}

function validRule(
  value: unknown,
  input: WritingAnalysisInput,
): value is WritingRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exactKeys(item, ['rule', 'justification', 'evidence']) &&
    nonEmpty(item.rule) &&
    nonEmpty(item.justification) &&
    Array.isArray(item.evidence) &&
    item.evidence.every((entry) => validEvidence(entry, input))
  )
}

function validProfile(
  value: unknown,
  input: WritingAnalysisInput,
  section = false,
): value is WritingStyleProfile | SectionWritingStyle {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  const keys = section ? SECTION_KEYS : PROFILE_KEYS
  if (!exactKeys(item, keys)) return false
  const strings = [
    'tone',
    'formality',
    'technicality',
    'objectivity',
    'sentenceComplexity',
    'grammaticalPerson',
    'verbTense',
    'voice',
    'firstPersonUsage',
    'thirdPersonUsage',
    'detailLevel',
    'narrativeStyle',
  ]
  if (
    !strings.every((key) => nonEmpty(item[key])) ||
    typeof item.averageParagraphWords !== 'number' ||
    !Number.isFinite(item.averageParagraphWords) ||
    item.averageParagraphWords < 0 ||
    !Array.isArray(item.evidence) ||
    !item.evidence.every((entry) => validEvidence(entry, input))
  )
    return false
  if (!section) return true
  if (
    !nonEmpty(item.sectionName) ||
    !input.sections.some((entry) => entry.name === item.sectionName)
  )
    return false
  if (
    !(item.evidence as WritingEvidence[]).every(
      (evidence) =>
        evidence.sectionName === null ||
        evidence.sectionName === item.sectionName,
    )
  )
    return false
  return [
    'introductionPatterns',
    'developmentPatterns',
    'conclusionPatterns',
  ].every(
    (key) =>
      Array.isArray(item[key]) &&
      item[key].every((entry: unknown) => validRule(entry, input)),
  )
}

export function isWritingPattern(
  value: unknown,
  input: WritingAnalysisInput,
): value is WritingPattern {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (!exactKeys(item, ROOT_KEYS) || !validProfile(item.globalStyle, input))
    return false
  if (
    !Array.isArray(item.sectionStyles) ||
    !item.sectionStyles.every((style) => validProfile(style, input, true))
  )
    return false
  const names = item.sectionStyles.map(
    (style) => (style as SectionWritingStyle).sectionName,
  )
  if (new Set(names).size !== names.length) return false
  const relevantSections = input.sections
    .filter((section) => section.samples.length > 0)
    .map((section) => section.name)
  if (
    names.length !== relevantSections.length ||
    !relevantSections.every((name) => names.includes(name))
  )
    return false
  return ROOT_KEYS.slice(2).every(
    (key) =>
      Array.isArray(item[key]) &&
      item[key].every((rule: unknown) => validRule(rule, input)),
  )
}

export class WritingAnalysisService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async analyze(
    document: DocumentRepresentation,
    structure: StructurePattern,
  ): Promise<WritingPattern> {
    const input = buildWritingAnalysisInput(document, structure)
    const response = await this.generator.generateJson(
      buildWritingAnalysisPrompt(input),
      WRITING_PATTERN_SCHEMA,
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new WritingAnalysisError(
        'O Ollama retornou JSON inválido para o padrão de escrita.',
      )
    }
    if (!isWritingPattern(parsed, input))
      throw new WritingAnalysisError(
        'A análise de escrita não corresponde ao contrato ou contém evidências não fornecidas.',
      )
    return parsed
  }
}
