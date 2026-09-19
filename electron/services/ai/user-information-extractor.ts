import type {
  StructuredActivity,
  StructuredActivityItem,
  StructuredFact,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { buildUserInformationExtractionPrompt } from './prompts/user-information-extraction.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'

const EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          value: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['name', 'label', 'value', 'evidence'],
        additionalProperties: false,
      },
    },
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          procedures: { type: 'array', items: { type: 'string' } },
          result: { type: ['string', 'null'] },
          problems: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'description',
          'procedures',
          'result',
          'problems',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['facts', 'activities'],
  additionalProperties: false,
}

export class UserInformationExtractionError extends Error {
  readonly code = 'INVALID_MODEL_RESPONSE' as const
  constructor(message: string) {
    super(message)
    this.name = 'UserInformationExtractionError'
  }
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}
function evidenceExists(evidence: string, source: string): boolean {
  return source
    .toLocaleLowerCase('pt-BR')
    .includes(evidence.trim().toLocaleLowerCase('pt-BR'))
}

function validFact(value: unknown, source: string): value is StructuredFact {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, ['name', 'label', 'value', 'evidence']) &&
    nonEmpty(item.name) &&
    nonEmpty(item.label) &&
    nonEmpty(item.value) &&
    nonEmpty(item.evidence) &&
    evidenceExists(item.evidence, source)
  )
}

function validActivity(
  value: unknown,
  source: string,
): value is StructuredActivityItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, [
      'description',
      'procedures',
      'result',
      'problems',
      'evidence',
    ]) &&
    nonEmpty(item.description) &&
    Array.isArray(item.procedures) &&
    item.procedures.every(nonEmpty) &&
    (item.result === null || nonEmpty(item.result)) &&
    Array.isArray(item.problems) &&
    item.problems.every(nonEmpty) &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every(
      (entry) => nonEmpty(entry) && evidenceExists(entry, source),
    )
  )
}

export class UserInformationExtractor {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async extract(
    text: string,
    template: ReportTemplate,
  ): Promise<StructuredActivity> {
    const response = await this.generator.generateJson(
      buildUserInformationExtractionPrompt(text, template),
      EXTRACTION_SCHEMA,
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new UserInformationExtractionError(
        'A IA retornou JSON inválido ao interpretar as informações.',
      )
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new UserInformationExtractionError(
        'A resposta de extração não corresponde ao contrato esperado.',
      )
    const item = parsed as Record<string, unknown>
    if (
      !exact(item, ['facts', 'activities']) ||
      !Array.isArray(item.facts) ||
      !item.facts.every((fact) => validFact(fact, text)) ||
      !Array.isArray(item.activities) ||
      !item.activities.every((activity) => validActivity(activity, text))
    )
      throw new UserInformationExtractionError(
        'A extração contém estrutura inválida ou evidências não fornecidas pelo usuário.',
      )
    return {
      facts: item.facts as StructuredFact[],
      activities: item.activities as StructuredActivityItem[],
    }
  }
}
