import type {
  SectionWritingStyle,
  StructurePattern,
  WritingEvidence,
  WritingPattern,
  WritingRule,
  WritingStyleProfile,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import type { StructuredTextGenerator } from './report-extraction.service'
import {
  buildWritingAnalysisInput,
  buildWritingAnalysisPrompt,
  type WritingAnalysisInput,
} from './prompts/writing-analysis.prompt'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('WritingAnalysisService')
export const WRITING_ANALYZER_VERSION = '1' as const
export const WRITING_PATTERN_STAGE_VERSION = '1' as const
export const WRITING_ANALYSIS_SECTION_BATCH_SIZE = 4

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
const EVIDENCE_ARRAY_SCHEMA = {
  type: 'array',
  items: EVIDENCE_SCHEMA,
  maxItems: 3,
}
const RULE_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    justification: { type: 'string' },
    evidence: EVIDENCE_ARRAY_SCHEMA,
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
  evidence: EVIDENCE_ARRAY_SCHEMA,
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
          introductionPatterns: {
            type: 'array',
            items: RULE_SCHEMA,
            maxItems: 3,
          },
          developmentPatterns: {
            type: 'array',
            items: RULE_SCHEMA,
            maxItems: 3,
          },
          conclusionPatterns: {
            type: 'array',
            items: RULE_SCHEMA,
            maxItems: 3,
          },
        },
        required: [...SECTION_KEYS],
        additionalProperties: false,
      },
    },
    vocabulary: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
    terminology: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
    sentencePatterns: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
    paragraphPatterns: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
    narrativePatterns: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
    forbiddenPatterns: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
    recommendedPatterns: { type: 'array', items: RULE_SCHEMA, maxItems: 8 },
  },
  required: [...ROOT_KEYS],
  additionalProperties: false,
}

function constrainedWritingSchema(
  input: WritingAnalysisInput,
): Record<string, unknown> {
  const schema = structuredClone(WRITING_PATTERN_SCHEMA)
  const sectionNames = input.sections
    .filter((section) => section.samples.length > 0)
    .map((section) => section.name)
  const excerpts = input.sections.flatMap((section) => section.samples)
  const constrainEvidence = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return
    const item = value as Record<string, unknown>
    const properties = item.properties
    if (typeof properties === 'object' && properties !== null) {
      const fields = properties as Record<string, unknown>
      if (
        Object.hasOwn(fields, 'sectionName') &&
        Object.hasOwn(fields, 'excerpt') &&
        Object.hasOwn(fields, 'reason')
      ) {
        fields.sectionName = { enum: [null, ...sectionNames] }
        fields.excerpt = { type: 'string', enum: excerpts }
      }
      Object.values(fields).forEach(constrainEvidence)
    }
    constrainEvidence(item.items)
  }
  constrainEvidence(schema)
  const properties = schema.properties as Record<string, unknown>
  const sectionStyles = properties.sectionStyles as Record<string, unknown>
  sectionStyles.minItems = sectionNames.length
  sectionStyles.maxItems = sectionNames.length
  return schema
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

function normalizedName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/^\s*\d+(?:\.\d+)*[.)-]?\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizedExcerpt(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim()
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
      : input.sections.find(
          (section) =>
            normalizedName(section.name) ===
            normalizedName(item.sectionName as string),
        )?.samples
  return (
    candidates !== undefined &&
    candidates.some((sample) =>
      normalizedExcerpt(sample).includes(
        normalizedExcerpt(item.excerpt as string),
      ),
    )
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
    !input.sections.some(
      (entry) =>
        normalizedName(entry.name) ===
        normalizedName(item.sectionName as string),
    )
  )
    return false
  if (
    !(item.evidence as WritingEvidence[]).every(
      (evidence) =>
        evidence.sectionName === null ||
        normalizedName(evidence.sectionName) ===
          normalizedName(item.sectionName as string),
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
  const names = item.sectionStyles.map((style) =>
    normalizedName((style as SectionWritingStyle).sectionName),
  )
  if (new Set(names).size !== names.length) return false
  const relevantSections = input.sections
    .filter((section) => section.samples.length > 0)
    .map((section) => normalizedName(section.name))
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

export function diagnoseWritingPattern(
  value: unknown,
  input: WritingAnalysisInput,
): Record<string, number | boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { rootObject: false }
  const item = value as Record<string, unknown>
  const styles = Array.isArray(item.sectionStyles) ? item.sectionStyles : []
  const expectedStyles = input.sections.filter(
    (section) => section.samples.length > 0,
  ).length
  const returnedNames = styles
    .filter(
      (style): style is Record<string, unknown> =>
        typeof style === 'object' && style !== null && !Array.isArray(style),
    )
    .map((style) =>
      typeof style.sectionName === 'string'
        ? normalizedName(style.sectionName)
        : '',
    )
  return {
    rootObject: true,
    rootKeysValid: exactKeys(item, ROOT_KEYS),
    globalProfileValid: validProfile(item.globalStyle, input),
    sectionStylesArray: Array.isArray(item.sectionStyles),
    expectedStyles,
    returnedStyles: styles.length,
    invalidSectionStyles: styles.filter(
      (style) => !validProfile(style, input, true),
    ).length,
    duplicateSectionNames: returnedNames.length - new Set(returnedNames).size,
    globalRuleListsValid: ROOT_KEYS.slice(2).every(
      (key) =>
        Array.isArray(item[key]) &&
        item[key].every((rule: unknown) => validRule(rule, input)),
    ),
  }
}

function uniqueEvidence(patterns: WritingPattern[]): WritingEvidence[] {
  const evidence = patterns.flatMap((pattern) => pattern.globalStyle.evidence)
  return [
    ...new Map(evidence.map((item) => [JSON.stringify(item), item])).values(),
  ]
}

function mode(
  patterns: WritingPattern[],
  key: keyof WritingStyleProfile,
): string {
  const counts = new Map<string, number>()
  for (const pattern of patterns) {
    const value = pattern.globalStyle[key]
    if (typeof value === 'string')
      counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    ''
  )
}

function mergeRules(
  patterns: WritingPattern[],
  key: keyof WritingPattern,
): WritingRule[] {
  const rules = patterns.flatMap((pattern) => {
    const value = pattern[key]
    return Array.isArray(value) ? (value as WritingRule[]) : []
  })
  return [
    ...new Map(rules.map((rule) => [JSON.stringify(rule), rule])).values(),
  ]
}

function mergeWritingPatterns(patterns: WritingPattern[]): WritingPattern {
  const first = patterns[0]
  if (!first)
    throw new WritingAnalysisError('Nenhum padrão de escrita foi produzido.')
  const stringKeys = [
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
  ] as const
  const globalStyle = {
    ...first.globalStyle,
    evidence: uniqueEvidence(patterns),
  }
  for (const key of stringKeys) globalStyle[key] = mode(patterns, key)
  globalStyle.averageParagraphWords =
    patterns.reduce(
      (total, pattern) => total + pattern.globalStyle.averageParagraphWords,
      0,
    ) / patterns.length
  return {
    globalStyle,
    sectionStyles: patterns.flatMap((pattern) => pattern.sectionStyles),
    vocabulary: mergeRules(patterns, 'vocabulary'),
    terminology: mergeRules(patterns, 'terminology'),
    sentencePatterns: mergeRules(patterns, 'sentencePatterns'),
    paragraphPatterns: mergeRules(patterns, 'paragraphPatterns'),
    narrativePatterns: mergeRules(patterns, 'narrativePatterns'),
    forbiddenPatterns: mergeRules(patterns, 'forbiddenPatterns'),
    recommendedPatterns: mergeRules(patterns, 'recommendedPatterns'),
  }
}

function removeInvalidEvidence(
  value: unknown,
  input: WritingAnalysisInput,
): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const originalEvidence =
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          Array.isArray((item as Record<string, unknown>).evidence)
            ? ((item as Record<string, unknown>).evidence as unknown[])
            : null
        const normalized = removeInvalidEvidence(item, input)
        if (
          typeof normalized === 'object' &&
          normalized !== null &&
          !Array.isArray(normalized) &&
          Object.hasOwn(normalized, 'rule') &&
          (!nonEmpty((normalized as Record<string, unknown>).rule) ||
            !nonEmpty((normalized as Record<string, unknown>).justification))
        )
          return null
        if (
          originalEvidence &&
          originalEvidence.length > 0 &&
          typeof normalized === 'object' &&
          normalized !== null &&
          !Array.isArray(normalized) &&
          Array.isArray((normalized as Record<string, unknown>).evidence) &&
          ((normalized as Record<string, unknown>).evidence as unknown[])
            .length === 0 &&
          Object.hasOwn(normalized, 'rule')
        )
          return null
        return normalized
      })
      .filter((item) => item !== null)
  }
  if (typeof value !== 'object' || value === null) return value
  const item = value as Record<string, unknown>
  const result = Object.fromEntries(
    Object.entries(item).map(([key, entry]) => [
      key,
      removeInvalidEvidence(entry, input),
    ]),
  )
  if (Array.isArray(item.evidence)) {
    result.evidence = item.evidence.filter((evidence) => {
      if (!validEvidence(evidence, input)) {
        if (
          typeof evidence === 'object' &&
          evidence !== null &&
          !Array.isArray(evidence)
        ) {
          const candidate = evidence as Record<string, unknown>
          if (validEvidence({ ...candidate, sectionName: null }, input))
            return false
        }
        return true
      }
      if (
        !Object.hasOwn(item, 'sectionName') ||
        typeof item.sectionName !== 'string'
      )
        return true
      const typed = evidence as WritingEvidence
      return (
        typed.sectionName === null ||
        normalizedName(typed.sectionName) === normalizedName(item.sectionName)
      )
    })
  }
  return result
}

export class WritingAnalysisService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async analyze(
    document: DocumentRepresentation,
    structure: StructurePattern,
  ): Promise<WritingPattern> {
    const timer = logger.startTimer('Writing analysis')
    logger.info('Writing analysis started', {
      sections: structure.sections.length,
    })
    const input = buildWritingAnalysisInput(document, structure)
    const relevantSections = input.sections.filter(
      (section) => section.samples.length > 0,
    )
    const batches: WritingAnalysisInput[] = []
    for (
      let index = 0;
      index < relevantSections.length;
      index += WRITING_ANALYSIS_SECTION_BATCH_SIZE
    ) {
      const sections = relevantSections.slice(
        index,
        index + WRITING_ANALYSIS_SECTION_BATCH_SIZE,
      )
      const names = new Set(
        sections.map((section) => normalizedName(section.name)),
      )
      batches.push({
        ...input,
        hierarchy: input.hierarchy.filter((section) =>
          names.has(normalizedName(section.name)),
        ),
        sections,
      })
    }
    if (batches.length === 0) batches.push(input)
    const patterns: WritingPattern[] = []
    for (const [index, batch] of batches.entries()) {
      logger.info('Writing analysis batch started', {
        batch: index + 1,
        batches: batches.length,
        sections: batch.sections.length,
      })
      patterns.push(await this.analyzeBatch(batch))
    }
    const parsed = mergeWritingPatterns(patterns)
    if (!isWritingPattern(parsed, input)) {
      logger.error('Writing analysis merged result failed validation', {
        validation: diagnoseWritingPattern(parsed, input),
      })
      throw new WritingAnalysisError(
        'A análise de escrita consolidada não corresponde ao contrato.',
      )
    }
    const rules =
      parsed.vocabulary.length +
      parsed.terminology.length +
      parsed.sentencePatterns.length +
      parsed.paragraphPatterns.length +
      parsed.narrativePatterns.length +
      parsed.forbiddenPatterns.length +
      parsed.recommendedPatterns.length
    timer.end('Writing analysis completed', {
      batches: batches.length,
      sectionStyles: parsed.sectionStyles.length,
      rules,
    })
    return parsed
  }

  private async analyzeBatch(
    input: WritingAnalysisInput,
  ): Promise<WritingPattern> {
    const response = await this.generator.generateJson(
      buildWritingAnalysisPrompt(input),
      constrainedWritingSchema(input),
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new WritingAnalysisError(
        'O Ollama retornou JSON inválido para o padrão de escrita.',
      )
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as Record<string, unknown>).sectionStyles)
    ) {
      const styles = (parsed as Record<string, unknown>)
        .sectionStyles as unknown[]
      const expectedNames = input.sections.map((section) =>
        normalizedName(section.name),
      )
      const returnedNames = styles.map((style) =>
        typeof style === 'object' &&
        style !== null &&
        !Array.isArray(style) &&
        typeof (style as Record<string, unknown>).sectionName === 'string'
          ? normalizedName(
              (style as Record<string, unknown>).sectionName as string,
            )
          : '',
      )
      const onlyKnownNames = returnedNames.every((name) =>
        expectedNames.includes(name),
      )
      const sameNameSet =
        new Set(returnedNames).size === returnedNames.length &&
        expectedNames.every((name) => returnedNames.includes(name))
      if (
        styles.length === input.sections.length &&
        onlyKnownNames &&
        !sameNameSet
      ) {
        ;(parsed as Record<string, unknown>).sectionStyles = styles.map(
          (style, index) =>
            typeof style === 'object' && style !== null && !Array.isArray(style)
              ? { ...style, sectionName: input.sections[index]?.name ?? '' }
              : style,
        )
      }
    }
    parsed = removeInvalidEvidence(parsed, input)
    if (!isWritingPattern(parsed, input)) {
      logger.error('Writing analysis validation failed', {
        validation: diagnoseWritingPattern(parsed, input),
      })
      throw new WritingAnalysisError(
        'A análise de escrita não corresponde ao contrato ou contém evidências não fornecidas.',
      )
    }
    return parsed
  }
}
