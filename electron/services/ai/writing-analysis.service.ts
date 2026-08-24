import type {
  SectionWritingStyle,
  StructurePattern,
  WritingEvidence,
  WritingPattern,
  WritingRule,
  WritingStyleProfile,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import type { DocumentAnalysisContext } from '../documents/document-analysis-context'
import type { StructuredTextGenerator } from './report-extraction.service'
import {
  buildWritingAnalysisInput,
  buildWritingAnalysisPlan,
  buildWritingAnalysisPrompt,
  buildWritingPromptContext,
  type WritingAnalysisInput,
  type WritingAnalysisPlanBatch,
  type WritingSectionSample,
} from './prompts/writing-analysis.prompt'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('WritingAnalysisService')
export const WRITING_ANALYZER_VERSION = '2' as const
export const WRITING_PATTERN_STAGE_VERSION = '1' as const

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
const BATCH_SECTION_KEYS = [
  'sectionId',
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
const BATCH_ROOT_KEYS = [
  'batchId',
  'sectionStyles',
  'vocabulary',
  'terminology',
  'sentencePatterns',
  'paragraphPatterns',
  'narrativePatterns',
  'forbiddenPatterns',
  'recommendedPatterns',
] as const
const STRING_PROFILE_KEYS = PROFILE_KEYS.filter(
  (key) => key !== 'averageParagraphWords' && key !== 'evidence',
) as Array<Exclude<keyof WritingStyleProfile, 'averageParagraphWords' | 'evidence'>>
const RULE_LIST_KEYS = ROOT_KEYS.slice(2) as Array<keyof Pick<
  WritingPattern,
  | 'vocabulary'
  | 'terminology'
  | 'sentencePatterns'
  | 'paragraphPatterns'
  | 'narrativePatterns'
  | 'forbiddenPatterns'
  | 'recommendedPatterns'
>>
const SECTION_PATTERN_KEYS = [
  'introductionPatterns',
  'developmentPatterns',
  'conclusionPatterns',
] as const

interface BatchEvidence {
  sectionId: string
  sampleId: string
  excerpt: string
  reason: string
}

interface BatchRule {
  rule: string
  justification: string
  evidence: BatchEvidence[]
}

type BatchProfile = Omit<WritingStyleProfile, 'evidence'> & {
  evidence: BatchEvidence[]
}

type BatchSectionStyle = Omit<SectionWritingStyle, 'sectionName' | 'evidence' | 'introductionPatterns' | 'developmentPatterns' | 'conclusionPatterns'> & {
  sectionId: string
  evidence: BatchEvidence[]
  introductionPatterns: BatchRule[]
  developmentPatterns: BatchRule[]
  conclusionPatterns: BatchRule[]
}

interface BatchWritingPattern {
  batchId: string
  sectionStyles: BatchSectionStyle[]
  vocabulary: BatchRule[]
  terminology: BatchRule[]
  sentencePatterns: BatchRule[]
  paragraphPatterns: BatchRule[]
  narrativePatterns: BatchRule[]
  forbiddenPatterns: BatchRule[]
  recommendedPatterns: BatchRule[]
}

const BATCH_EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    sectionId: { type: 'string' },
    sampleId: { type: 'string' },
    excerpt: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['sectionId', 'sampleId', 'excerpt', 'reason'],
  additionalProperties: false,
}
const BATCH_EVIDENCE_ARRAY_SCHEMA = {
  type: 'array',
  items: BATCH_EVIDENCE_SCHEMA,
  maxItems: 2,
}
const BATCH_RULE_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    justification: { type: 'string' },
    evidence: BATCH_EVIDENCE_ARRAY_SCHEMA,
  },
  required: ['rule', 'justification', 'evidence'],
  additionalProperties: false,
}
const BATCH_PROFILE_PROPERTIES = {
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
  evidence: BATCH_EVIDENCE_ARRAY_SCHEMA,
}
const BATCH_WRITING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    batchId: { type: 'string' },
    sectionStyles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sectionId: { type: 'string' },
          ...BATCH_PROFILE_PROPERTIES,
          introductionPatterns: {
            type: 'array',
            items: BATCH_RULE_SCHEMA,
            maxItems: 2,
          },
          developmentPatterns: {
            type: 'array',
            items: BATCH_RULE_SCHEMA,
            maxItems: 2,
          },
          conclusionPatterns: {
            type: 'array',
            items: BATCH_RULE_SCHEMA,
            maxItems: 2,
          },
        },
        required: [...BATCH_SECTION_KEYS],
        additionalProperties: false,
      },
    },
    vocabulary: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
    terminology: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
    sentencePatterns: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
    paragraphPatterns: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
    narrativePatterns: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
    forbiddenPatterns: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
    recommendedPatterns: { type: 'array', items: BATCH_RULE_SCHEMA, maxItems: 5 },
  },
  required: [...BATCH_ROOT_KEYS],
  additionalProperties: false,
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

function sectionById(
  input: WritingAnalysisInput,
  sectionId: string,
): WritingSectionSample | undefined {
  return input.sections.find((section) => section.id === sectionId)
}

function validBatchEvidence(
  value: unknown,
  batch: WritingAnalysisPlanBatch,
): value is BatchEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    !exactKeys(item, ['sectionId', 'sampleId', 'excerpt', 'reason']) ||
    !nonEmpty(item.sectionId) ||
    !nonEmpty(item.sampleId) ||
    !nonEmpty(item.excerpt) ||
    !nonEmpty(item.reason)
  )
    return false
  const section = sectionById(batch.input, item.sectionId)
  const sample = section?.samples.find((entry) => entry.id === item.sampleId)
  return (
    sample !== undefined &&
    normalizedExcerpt(sample.text).includes(
      normalizedExcerpt(item.excerpt as string),
    )
  )
}

function validBatchRule(
  value: unknown,
  batch: WritingAnalysisPlanBatch,
): value is BatchRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exactKeys(item, ['rule', 'justification', 'evidence']) &&
    nonEmpty(item.rule) &&
    nonEmpty(item.justification) &&
    Array.isArray(item.evidence) &&
    item.evidence.every((entry) => validBatchEvidence(entry, batch))
  )
}

function validBatchProfile(
  value: unknown,
  batch: WritingAnalysisPlanBatch,
): value is BatchProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    PROFILE_KEYS.every((key) => Object.hasOwn(item, key)) &&
    STRING_PROFILE_KEYS.every((key) => nonEmpty(item[key])) &&
    typeof item.averageParagraphWords === 'number' &&
    Number.isFinite(item.averageParagraphWords) &&
    item.averageParagraphWords >= 0 &&
    Array.isArray(item.evidence) &&
    item.evidence.every((entry) => validBatchEvidence(entry, batch))
  )
}

function validBatchSectionStyle(
  value: unknown,
  batch: WritingAnalysisPlanBatch,
): value is BatchSectionStyle {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    !exactKeys(item, BATCH_SECTION_KEYS) ||
    !nonEmpty(item.sectionId) ||
    !batch.sectionIds.includes(item.sectionId) ||
    !validBatchProfile(item, batch)
  )
    return false
  const section = value as Record<string, unknown>
  return SECTION_PATTERN_KEYS.every(
    (key) =>
      Array.isArray(section[key]) &&
      section[key].every((entry: unknown) => validBatchRule(entry, batch)),
  )
}

function isBatchWritingPattern(
  value: unknown,
  batch: WritingAnalysisPlanBatch,
): value is BatchWritingPattern {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    !exactKeys(item, BATCH_ROOT_KEYS) ||
    item.batchId !== batch.batchId ||
    !Array.isArray(item.sectionStyles) ||
    !item.sectionStyles.every((style) => validBatchSectionStyle(style, batch))
  )
    return false
  const returnedIds = item.sectionStyles.map(
    (style) => (style as BatchSectionStyle).sectionId,
  )
  if (
    new Set(returnedIds).size !== returnedIds.length ||
    returnedIds.length !== batch.sectionIds.length ||
    !batch.sectionIds.every((sectionId, index) => returnedIds[index] === sectionId)
  )
    return false
  return RULE_LIST_KEYS.every(
    (key) =>
      Array.isArray(item[key]) &&
      item[key].every((rule: unknown) => validBatchRule(rule, batch)),
  )
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
      ? input.sections.flatMap((section) =>
          section.samples.map((sample) => sample.text),
        )
      : input.sections
          .find(
            (section) =>
              normalizedName(section.name) ===
              normalizedName(item.sectionName as string),
          )
          ?.samples.map((sample) => sample.text)
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
  if (
    !STRING_PROFILE_KEYS.every((key) => nonEmpty(item[key])) ||
    typeof item.averageParagraphWords !== 'number' ||
    !Number.isFinite(item.averageParagraphWords) ||
    item.averageParagraphWords < 0 ||
    !Array.isArray(item.evidence) ||
    !item.evidence.every((entry) => validEvidence(entry, input))
  )
    return false
  if (!section) return true
  return (
    nonEmpty(item.sectionName) &&
    input.sections.some(
      (entry) =>
        normalizedName(entry.name) === normalizedName(item.sectionName as string),
    ) &&
    (item.evidence as WritingEvidence[]).every(
      (evidence) =>
        evidence.sectionName === null ||
        normalizedName(evidence.sectionName) ===
          normalizedName(item.sectionName as string),
    ) &&
    SECTION_PATTERN_KEYS.every(
      (key) =>
        Array.isArray(item[key]) &&
        item[key].every((entry: unknown) => validRule(entry, input)),
    )
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
  const relevantSections = input.sections
    .filter((section) => section.samples.length > 0)
    .map((section) => normalizedName(section.name))
  return (
    new Set(names).size === names.length &&
    names.length === relevantSections.length &&
    relevantSections.every((name) => names.includes(name)) &&
    RULE_LIST_KEYS.every(
      (key) =>
        Array.isArray(item[key]) &&
        item[key].every((rule: unknown) => validRule(rule, input)),
    )
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
    globalRuleListsValid: RULE_LIST_KEYS.every(
      (key) =>
        Array.isArray(item[key]) &&
        item[key].every((rule: unknown) => validRule(rule, input)),
    ),
  }
}

function uniqueByJson<T>(values: T[]): T[] {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()]
}

function batchEvidenceToPublic(
  evidence: BatchEvidence,
  input: WritingAnalysisInput,
): WritingEvidence {
  return {
    sectionName: sectionById(input, evidence.sectionId)?.name ?? null,
    excerpt: evidence.excerpt,
    reason: evidence.reason,
  }
}

function batchRuleToPublic(
  rule: BatchRule,
  input: WritingAnalysisInput,
): WritingRule {
  return {
    rule: rule.rule,
    justification: rule.justification,
    evidence: rule.evidence.map((evidence) =>
      batchEvidenceToPublic(evidence, input),
    ),
  }
}

function batchSectionToPublic(
  style: BatchSectionStyle,
  input: WritingAnalysisInput,
): SectionWritingStyle {
  return {
    tone: style.tone,
    formality: style.formality,
    technicality: style.technicality,
    objectivity: style.objectivity,
    averageParagraphWords: style.averageParagraphWords,
    sentenceComplexity: style.sentenceComplexity,
    grammaticalPerson: style.grammaticalPerson,
    verbTense: style.verbTense,
    voice: style.voice,
    firstPersonUsage: style.firstPersonUsage,
    thirdPersonUsage: style.thirdPersonUsage,
    detailLevel: style.detailLevel,
    narrativeStyle: style.narrativeStyle,
    evidence: style.evidence.map((evidence) =>
      batchEvidenceToPublic(evidence, input),
    ),
    sectionName: sectionById(input, style.sectionId)?.name ?? style.sectionId,
    introductionPatterns: style.introductionPatterns.map((rule) =>
      batchRuleToPublic(rule, input),
    ),
    developmentPatterns: style.developmentPatterns.map((rule) =>
      batchRuleToPublic(rule, input),
    ),
    conclusionPatterns: style.conclusionPatterns.map((rule) =>
      batchRuleToPublic(rule, input),
    ),
  }
}

function safeGlobalValue(
  sections: SectionWritingStyle[],
  key: Exclude<keyof WritingStyleProfile, 'averageParagraphWords' | 'evidence'>,
): string {
  const values = uniqueByJson(
    sections.map((section) => section[key]).filter(nonEmpty),
  )
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]!
  return `variável entre seções: ${values.join('; ')}`
}

function globalStyleFromSections(
  sectionStyles: SectionWritingStyle[],
): WritingStyleProfile {
  const first = sectionStyles[0]
  if (!first)
    throw new WritingAnalysisError('Nenhum padrão de escrita foi produzido.')
  const globalStyle: WritingStyleProfile = {
    tone: first.tone,
    formality: first.formality,
    technicality: first.technicality,
    objectivity: first.objectivity,
    sentenceComplexity: first.sentenceComplexity,
    grammaticalPerson: first.grammaticalPerson,
    verbTense: first.verbTense,
    voice: first.voice,
    firstPersonUsage: first.firstPersonUsage,
    thirdPersonUsage: first.thirdPersonUsage,
    detailLevel: first.detailLevel,
    narrativeStyle: first.narrativeStyle,
    evidence: uniqueByJson(sectionStyles.flatMap((section) => section.evidence)),
    averageParagraphWords:
      sectionStyles.reduce(
        (total, section) => total + section.averageParagraphWords,
        0,
      ) / sectionStyles.length,
  }
  for (const key of STRING_PROFILE_KEYS)
    globalStyle[key] = safeGlobalValue(sectionStyles, key)
  return globalStyle
}

function mergeRules(
  batches: BatchWritingPattern[],
  key: keyof Pick<
    BatchWritingPattern,
    | 'vocabulary'
    | 'terminology'
    | 'sentencePatterns'
    | 'paragraphPatterns'
    | 'narrativePatterns'
    | 'forbiddenPatterns'
    | 'recommendedPatterns'
  >,
  input: WritingAnalysisInput,
): WritingRule[] {
  return uniqueByJson(
    batches.flatMap((batch) =>
      batch[key].map((rule) => batchRuleToPublic(rule, input)),
    ),
  )
}

function mergeWritingBatches(
  batches: BatchWritingPattern[],
  input: WritingAnalysisInput,
): WritingPattern {
  const sectionStyles = batches.flatMap((batch) =>
    batch.sectionStyles.map((style) => batchSectionToPublic(style, input)),
  )
  return {
    globalStyle: globalStyleFromSections(sectionStyles),
    sectionStyles,
    vocabulary: mergeRules(batches, 'vocabulary', input),
    terminology: mergeRules(batches, 'terminology', input),
    sentencePatterns: mergeRules(batches, 'sentencePatterns', input),
    paragraphPatterns: mergeRules(batches, 'paragraphPatterns', input),
    narrativePatterns: mergeRules(batches, 'narrativePatterns', input),
    forbiddenPatterns: mergeRules(batches, 'forbiddenPatterns', input),
    recommendedPatterns: mergeRules(batches, 'recommendedPatterns', input),
  }
}

function constrainedBatchSchema(batch: WritingAnalysisPlanBatch): Record<string, unknown> {
  const schema = structuredClone(BATCH_WRITING_SCHEMA)
  const samples = new Map(
    batch.input.sections.flatMap((section) =>
      section.samples.map((sample) => [
        sample.id,
        { sectionId: section.id, text: sample.text },
      ] as const),
    ),
  )
  const sectionIds = batch.sectionIds
  const sampleIds = [...samples.keys()]
  const constrainEvidence = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return
    const item = value as Record<string, unknown>
    const properties = item.properties
    if (typeof properties === 'object' && properties !== null) {
      const fields = properties as Record<string, unknown>
      if (
        Object.hasOwn(fields, 'sectionId') &&
        Object.hasOwn(fields, 'sampleId') &&
        Object.hasOwn(fields, 'excerpt')
      ) {
        fields.sectionId = { enum: sectionIds }
        fields.sampleId = { enum: sampleIds }
        fields.excerpt = { type: 'string' }
      }
      Object.values(fields).forEach(constrainEvidence)
    }
    constrainEvidence(item.items)
  }
  constrainEvidence(schema)
  const properties = schema.properties as Record<string, unknown>
  properties.batchId = { const: batch.batchId }
  const sectionStyles = properties.sectionStyles as Record<string, unknown>
  sectionStyles.minItems = sectionIds.length
  sectionStyles.maxItems = sectionIds.length
  return schema
}

export class WritingAnalysisError extends Error {
  readonly code = 'INVALID_WRITING_ANALYSIS' as const
  constructor(message: string) {
    super(message)
    this.name = 'WritingAnalysisError'
  }
}

export class WritingAnalysisService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async analyze(
    document: DocumentRepresentation | DocumentAnalysisContext,
    structure: StructurePattern,
  ): Promise<WritingPattern> {
    const timer = logger.startTimer('Writing analysis')
    logger.info('Writing analysis started', {
      sections: structure.sections.length,
    })
    const input = buildWritingAnalysisInput(document, structure)
    const plan = buildWritingAnalysisPlan(input)
    const batches: BatchWritingPattern[] = []
    for (const batch of plan.batches) {
      if (batch.sectionIds.length === 0) continue
      batches.push(await this.analyzeBatchWithRetry(batch))
    }
    const parsed = mergeWritingBatches(batches, input)
    if (!isWritingPattern(parsed, input)) {
      logger.error('Writing analysis merged result failed validation', {
        validation: diagnoseWritingPattern(parsed, input),
      })
      throw new WritingAnalysisError(
        'A análise de escrita consolidada não corresponde ao contrato.',
      )
    }
    timer.end('Writing analysis completed', {
      batches: plan.batches.length,
      sectionStyles: parsed.sectionStyles.length,
      rules: RULE_LIST_KEYS.reduce(
        (total, key) => total + parsed[key].length,
        0,
      ),
    })
    return parsed
  }

  private async analyzeBatch(
    batch: WritingAnalysisPlanBatch,
  ): Promise<BatchWritingPattern> {
    logger.info('Writing analysis batch started', {
      batchId: batch.batchId,
      sections: batch.sectionIds.length,
      contextLimit: batch.contextLimits.maxBatchCharacters,
    })
    const response = await this.generator.generateJson(
      buildWritingAnalysisPrompt(buildWritingPromptContext(batch)),
      constrainedBatchSchema(batch),
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new WritingAnalysisError(
        'O Ollama retornou JSON inválido para o padrão de escrita.',
      )
    }
    if (!isBatchWritingPattern(parsed, batch)) {
      logger.error('Writing analysis batch validation failed', {
        batchId: batch.batchId,
        sections: batch.sectionIds.length,
      })
      throw new WritingAnalysisError(
        'A análise de escrita do lote não corresponde ao contrato ou contém evidências inválidas.',
      )
    }
    return parsed
  }

  private async analyzeBatchWithRetry(
    batch: WritingAnalysisPlanBatch,
  ): Promise<BatchWritingPattern> {
    try {
      return await this.analyzeBatch(batch)
    } catch (error: unknown) {
      logger.warn('Writing analysis batch failed; retrying same batch only', {
        batchId: batch.batchId,
      })
      try {
        return await this.analyzeBatch(batch)
      } catch {
        throw error
      }
    }
  }
}
