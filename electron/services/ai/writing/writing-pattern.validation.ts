import type {
  SectionWritingStyle,
  WritingEvidence,
  WritingPattern,
  WritingRule,
  WritingStyleProfile,
} from '../../../../src/domain/templates'
import type { WritingAnalysisInput } from '../prompts/writing-analysis.prompt'
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
